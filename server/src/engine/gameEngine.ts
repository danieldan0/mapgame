import type { GameAction, GameState, PlannedActionType, Tile } from '@mapgame/shared';

interface ActionResult {
  actionAccepted: boolean;
  stateChanged: boolean;
}

const CLAIM_COST = 1;
const SEA_TRAVEL_COST = 3;

export function startTurn(gameState: GameState): void {
  gameState.turnState = {
    playerTurns: Object.fromEntries(
      Object.keys(gameState.players).map(playerId => [
        Number(playerId),
        {
          ...rollForPlayer(gameState, Number(playerId)),
          hasActed: !playerHasTiles(gameState, Number(playerId)),
        },
      ])
    ),
    defenseRolls: {},
  };
}

export function handleAction(gameState: GameState, action: GameAction, actingPlayerId: number): ActionResult {
  const playerTurn = gameState.turnState.playerTurns[actingPlayerId];
  if (!playerTurn || playerTurn.hasActed) {
    return { actionAccepted: false, stateChanged: false };
  }

  if (action.type === 'END_TURN') {
    playerTurn.hasActed = true;
    return { actionAccepted: true, stateChanged: true };
  }

  const targetTileIds = uniqueIds(action.targetTileIds);
  if (targetTileIds.length === 0 && action.actionType !== 'ATTACK') {
    return { actionAccepted: false, stateChanged: false };
  }

  if (action.actionType === 'EXPAND') {
    return submitExpandPlan(gameState, actingPlayerId, targetTileIds, playerTurn.roll);
  }

  return submitAttackPlan(gameState, actingPlayerId, targetTileIds, playerTurn.roll, action.defenderId);
}

export function haveAllPlayersActed(gameState: GameState): boolean {
  return Object.values(gameState.turnState.playerTurns).every(playerTurn => playerTurn.hasActed);
}

export function skipPlayersWithNoTiles(gameState: GameState): boolean {
  let stateChanged = false;

  for (const playerId of Object.keys(gameState.players).map(Number)) {
    const playerTurn = gameState.turnState.playerTurns[playerId];
    if (playerTurn && !playerTurn.hasActed && !playerHasTiles(gameState, playerId)) {
      playerTurn.hasActed = true;
      stateChanged = true;
    }
  }

  return stateChanged;
}

export function previewAttack(gameState: GameState, attackerId: number, defenderId: number): boolean {
  const playerTurn = gameState.turnState.playerTurns[attackerId];
  if (!playerTurn || playerTurn.hasActed || !gameState.players[defenderId] || attackerId === defenderId) {
    return false;
  }

  const hasAttackableBorder = Object.values(gameState.tiles).some(tile => {
    return tile.ownerId === defenderId && getClaimCost(gameState, attackerId, tile, new Set()) <= playerTurn.roll;
  });
  if (!hasAttackableBorder) return false;

  getDefenseRoll(gameState, attackerId, defenderId);
  return true;
}

function submitExpandPlan(
  gameState: GameState,
  actingPlayerId: number,
  targetTileIds: number[],
  claimBudget: number
): ActionResult {
  if (getPlanCost(gameState, actingPlayerId, targetTileIds, tile => tile.ownerId === null && tile.typeId !== 'sea') > claimBudget) {
    return { actionAccepted: false, stateChanged: false };
  }

  const isValid = isReachableClaimPlan(gameState, actingPlayerId, targetTileIds, tile => tile.ownerId === null && tile.typeId !== 'sea');
  if (!isValid) {
    return { actionAccepted: false, stateChanged: false };
  }

  for (const tileId of targetTileIds) {
    gameState.tiles[tileId].ownerId = actingPlayerId;
  }
  gameState.turnState.playerTurns[actingPlayerId].hasActed = true;

  return { actionAccepted: true, stateChanged: true };
}

function submitAttackPlan(
  gameState: GameState,
  actingPlayerId: number,
  targetTileIds: number[],
  attackRoll: number,
  submittedDefenderId?: number
): ActionResult {
  const firstTarget = gameState.tiles[targetTileIds[0]];
  const defenderId = firstTarget?.ownerId ?? submittedDefenderId ?? null;
  if (defenderId === null || defenderId === actingPlayerId) {
    return { actionAccepted: false, stateChanged: false };
  }

  const defenseRoll = getDefenseRoll(gameState, actingPlayerId, defenderId);
  const claimBudget = Math.max(0, attackRoll - defenseRoll.roll);

  if (getPlanCost(gameState, actingPlayerId, targetTileIds, tile => tile.ownerId === defenderId) > claimBudget) {
    return { actionAccepted: false, stateChanged: true };
  }

  if (claimBudget === 0 && targetTileIds.length === 0) {
    gameState.turnState.playerTurns[actingPlayerId].hasActed = true;
    return { actionAccepted: true, stateChanged: true };
  }

  const isValid = isReachableClaimPlan(gameState, actingPlayerId, targetTileIds, tile => tile.ownerId === defenderId);
  if (!isValid) {
    return { actionAccepted: false, stateChanged: true };
  }

  for (const tileId of targetTileIds) {
    gameState.tiles[tileId].ownerId = actingPlayerId;
  }
  gameState.turnState.playerTurns[actingPlayerId].hasActed = true;

  return { actionAccepted: true, stateChanged: true };
}

function getDefenseRoll(gameState: GameState, attackerId: number, defenderId: number) {
  const key = getDefenseRollKey(attackerId, defenderId);
  const existingRoll = gameState.turnState.defenseRolls[key];
  if (existingRoll) return existingRoll;

  const defenseRoll = {
    attackerId,
    defenderId,
    ...rollForPlayer(gameState, defenderId),
  };
  gameState.turnState.defenseRolls[key] = defenseRoll;
  return defenseRoll;
}

function isReachableClaimPlan(
  gameState: GameState,
  actingPlayerId: number,
  targetTileIds: number[],
  canClaimTile: (tile: Tile) => boolean
): boolean {
  return getPlanCost(gameState, actingPlayerId, targetTileIds, canClaimTile) !== Infinity;
}

function getPlanCost(
  gameState: GameState,
  actingPlayerId: number,
  targetTileIds: number[],
  canClaimTile: (tile: Tile) => boolean
): number {
  const remainingTargets = new Set(targetTileIds);
  const claimedThisPlan = new Set<number>();
  let totalCost = 0;

  while (remainingTargets.size > 0) {
    let cheapestClaim: { tileId: number; cost: number } | null = null;

    for (const tileId of remainingTargets) {
      const tile = gameState.tiles[tileId];
      if (!tile || !canClaimTile(tile)) continue;

      const cost = getClaimCost(gameState, actingPlayerId, tile, claimedThisPlan);
      if (cost !== Infinity && (!cheapestClaim || cost < cheapestClaim.cost)) {
        cheapestClaim = { tileId, cost };
      }
    }

    if (!cheapestClaim) {
      return Infinity;
    }

    totalCost += cheapestClaim.cost;
    remainingTargets.delete(cheapestClaim.tileId);
    claimedThisPlan.add(cheapestClaim.tileId);
  }

  return totalCost;
}

function getClaimCost(
  gameState: GameState,
  actingPlayerId: number,
  targetTile: Tile,
  claimedThisPlan: Set<number>
): number {
  const visitedSeaTileIds = new Set<number>();
  const queue: Array<{ tileId: number; cost: number }> = [];

  for (const neighborId of targetTile.neighbors) {
    const neighbor = gameState.tiles[neighborId];
    if (!neighbor) continue;

    if (neighbor.ownerId === actingPlayerId || claimedThisPlan.has(neighborId)) {
      return CLAIM_COST;
    }

    if (neighbor.typeId === 'sea') {
      queue.push({ tileId: neighborId, cost: SEA_TRAVEL_COST + CLAIM_COST });
      visitedSeaTileIds.add(neighborId);
    }
  }

  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost);
    const current = queue.shift();
    if (!current) break;

    const tile = gameState.tiles[current.tileId];
    if (!tile) continue;

    for (const neighborId of tile.neighbors) {
      const neighbor = gameState.tiles[neighborId];
      if (!neighbor) continue;

      if (neighbor.ownerId === actingPlayerId || claimedThisPlan.has(neighborId)) {
        return current.cost;
      }

      if (neighbor.typeId === 'sea' && !visitedSeaTileIds.has(neighborId)) {
        visitedSeaTileIds.add(neighborId);
        queue.push({ tileId: neighborId, cost: current.cost + SEA_TRAVEL_COST });
      }
    }
  }

  return Infinity;
}

function uniqueIds(ids: number[]): number[] {
  return Array.from(new Set(ids));
}

function getDefenseRollKey(attackerId: number, defenderId: number): string {
  return `${attackerId}:${defenderId}`;
}

function rollForPlayer(gameState: GameState, playerId: number): { roll: number; power: number; dieSize: number } {
  const power = getPlayerPower(gameState, playerId);
  const dieSize = 10 + power;

  return {
    roll: rollDie(dieSize),
    power,
    dieSize,
  };
}

function getPlayerPower(gameState: GameState, playerId: number): number {
  const ownedCityCount = Object.values(gameState.tiles).filter(tile => {
    return tile.ownerId === playerId && tile.typeId === 'city';
  }).length;

  return ownedCityCount * 2;
}

function rollDie(dieSize: number): number {
  return Math.floor(Math.random() * dieSize) + 1;
}

function playerHasTiles(gameState: GameState, playerId: number): boolean {
  return Object.values(gameState.tiles).some(tile => tile.ownerId === playerId);
}
