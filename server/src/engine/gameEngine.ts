import type { DiceFormula, GameAction, GameState, RuleSettings, Tile } from '@mapgame/shared';
import { DEFAULT_RULE_SETTINGS } from '@mapgame/shared';

interface ActionResult {
  actionAccepted: boolean;
  stateChanged: boolean;
}

function rules(gameState: GameState): RuleSettings {
  return gameState.rules ?? DEFAULT_RULE_SETTINGS;
}

export function startPlacementPhase(gameState: GameState): void {
  gameState.phase = 'placement';
  gameState.turnState = {
    playerTurns: Object.fromEntries(
      Object.keys(gameState.players).map(playerId => [
        Number(playerId),
        { expandRoll: 0, attackRoll: 0, power: 0, hasActed: false },
      ])
    ),
    defenseRolls: {},
  };
}

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

  if (gameState.phase === 'placement') {
    if (action.type === 'PLACE_START') {
      const tile = gameState.tiles[action.tileId];
      if (!tile || tile.typeId === 'sea') {
        return { actionAccepted: false, stateChanged: false };
      }
      if (tile.ownerId !== null && tile.ownerId !== actingPlayerId) {
        return { actionAccepted: false, stateChanged: false };
      }
      for (const t of Object.values(gameState.tiles)) {
        if (t.ownerId === actingPlayerId) { t.ownerId = null; break; }
      }
      tile.ownerId = actingPlayerId;
      return { actionAccepted: true, stateChanged: true };
    }

    if (action.type === 'CONFIRM_PLACEMENT') {
      const hasPlaced = Object.values(gameState.tiles).some(t => t.ownerId === actingPlayerId);
      if (!hasPlaced) return { actionAccepted: false, stateChanged: false };
      playerTurn.hasActed = true;
      return { actionAccepted: true, stateChanged: true };
    }

    return { actionAccepted: false, stateChanged: false };
  }

  if (action.type === 'END_TURN') {
    playerTurn.hasActed = true;
    return { actionAccepted: true, stateChanged: true };
  }

  if (action.type !== 'SUBMIT_PLAN') {
    return { actionAccepted: false, stateChanged: false };
  }

  const targetTileIds = uniqueIds(action.targetTileIds);
  if (targetTileIds.length === 0 && action.actionType !== 'ATTACK') {
    return { actionAccepted: false, stateChanged: false };
  }

  if (action.actionType === 'EXPAND') {
    return submitExpandPlan(gameState, actingPlayerId, targetTileIds, playerTurn.expandRoll);
  }

  return submitAttackPlan(gameState, actingPlayerId, targetTileIds, playerTurn.attackRoll, action.defenderId);
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
  if (gameState.phase === 'placement') return false;
  const playerTurn = gameState.turnState.playerTurns[attackerId];
  if (!playerTurn || playerTurn.hasActed || !gameState.players[defenderId] || attackerId === defenderId) {
    return false;
  }

  const hasAttackableBorder = Object.values(gameState.tiles).some(tile => {
    return tile.ownerId === defenderId && getClaimCost(gameState, attackerId, tile, new Set()) <= playerTurn.attackRoll;
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
  applyEncirclement(gameState, actingPlayerId);
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
  applyEncirclement(gameState, actingPlayerId);
  gameState.turnState.playerTurns[actingPlayerId].hasActed = true;

  return { actionAccepted: true, stateChanged: true };
}

function applyEncirclement(gameState: GameState, actingPlayerId: number): void {
  const maxArea = rules(gameState).maxEncircledArea;
  const visitedTileIds = new Set<number>();

  for (const tile of Object.values(gameState.tiles)) {
    if (
      visitedTileIds.has(tile.id) ||
      tile.ownerId === actingPlayerId ||
      tile.typeId === 'sea' ||
      isCoastalTile(gameState, tile)
    ) {
      continue;
    }

    const region = collectEncirclementRegion(gameState, tile, actingPlayerId, visitedTileIds);

    if (
      region.tileIds.length > 0 &&
      region.tileIds.length <= maxArea &&
      region.isFullySurrounded
    ) {
      for (const tileId of region.tileIds) {
        gameState.tiles[tileId].ownerId = actingPlayerId;
      }
    }
  }
}

function collectEncirclementRegion(
  gameState: GameState,
  startTile: Tile,
  actingPlayerId: number,
  visitedTileIds: Set<number>
): { tileIds: number[]; isFullySurrounded: boolean } {
  const tileIds: number[] = [];
  const queue = [startTile.id];
  let isFullySurrounded = true;

  visitedTileIds.add(startTile.id);

  while (queue.length > 0) {
    const tileId = queue.shift();
    if (tileId === undefined) break;

    const tile = gameState.tiles[tileId];
    if (!tile) continue;

    tileIds.push(tile.id);

    if (tile.typeId === 'sea' || isCoastalTile(gameState, tile)) {
      isFullySurrounded = false;
    }

    for (const neighborId of tile.neighbors) {
      const neighbor = gameState.tiles[neighborId];
      if (!neighbor) continue;

      if (neighbor.ownerId === actingPlayerId) {
        continue;
      }

      if (neighbor.typeId === 'sea' || isCoastalTile(gameState, neighbor)) {
        isFullySurrounded = false;
        continue;
      }

      if (!visitedTileIds.has(neighborId)) {
        visitedTileIds.add(neighborId);
        queue.push(neighborId);
      }
    }
  }

  return { tileIds, isFullySurrounded };
}

function isCoastalTile(gameState: GameState, tile: Tile): boolean {
  return tile.neighbors.some(neighborId => gameState.tiles[neighborId]?.typeId === 'sea');
}

function getDefenseRoll(gameState: GameState, attackerId: number, defenderId: number) {
  const key = getDefenseRollKey(attackerId, defenderId);
  const existingRoll = gameState.turnState.defenseRolls[key];
  if (existingRoll) return existingRoll;

  const power = getPlayerPower(gameState, defenderId);
  const defenseRoll = {
    attackerId,
    defenderId,
    roll: rollDice(rules(gameState).defendRoll, power),
    power,
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
  const r = rules(gameState);
  const tileCost = targetTile.typeId === 'city' ? r.cityCost : r.claimCost;
  const seaTravelCost = r.seaTravelCost;

  const visitedSeaTileIds = new Set<number>();
  const queue: Array<{ tileId: number; cost: number }> = [];

  for (const neighborId of targetTile.neighbors) {
    const neighbor = gameState.tiles[neighborId];
    if (!neighbor) continue;

    if (neighbor.ownerId === actingPlayerId || claimedThisPlan.has(neighborId)) {
      return tileCost;
    }

    if (neighbor.typeId === 'sea') {
      queue.push({ tileId: neighborId, cost: seaTravelCost + tileCost });
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
        queue.push({ tileId: neighborId, cost: current.cost + seaTravelCost });
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

function rollForPlayer(gameState: GameState, playerId: number): { expandRoll: number; attackRoll: number; power: number } {
  const r = rules(gameState);
  const power = getPlayerPower(gameState, playerId);
  return {
    expandRoll: rollDice(r.expandRoll, power),
    attackRoll: rollDice(r.attackRoll, power),
    power,
  };
}

function rollDice(formula: DiceFormula, power: number): number {
  const effectiveSides = Math.max(1, formula.sides + Math.floor(power * formula.diePowerFactor));
  const effectiveBonus = formula.bonus + Math.floor(power * formula.bonusPowerFactor);
  let result = effectiveBonus;
  for (let i = 0; i < formula.count; i++) {
    result += Math.floor(Math.random() * effectiveSides) + 1;
  }
  return result;
}

function getPlayerPower(gameState: GameState, playerId: number): number {
  const ownedCityCount = Object.values(gameState.tiles).filter(tile => {
    return tile.ownerId === playerId && tile.typeId === 'city';
  }).length;

  return ownedCityCount * rules(gameState).powerPerCity;
}

function playerHasTiles(gameState: GameState, playerId: number): boolean {
  return Object.values(gameState.tiles).some(tile => tile.ownerId === playerId);
}
