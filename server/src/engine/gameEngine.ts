import type { GameAction, GameState, PlannedActionType, Tile } from '@mapgame/shared';

interface ActionResult {
  actionAccepted: boolean;
  stateChanged: boolean;
}

export function startTurn(gameState: GameState): void {
  gameState.turnState = {
    playerTurns: Object.fromEntries(
      Object.keys(gameState.players).map(playerId => [
        Number(playerId),
        {
          roll: rollDie(),
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
    return tile.ownerId === defenderId && tile.neighbors.some(neighborId => {
      return gameState.tiles[neighborId]?.ownerId === attackerId;
    });
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
  if (targetTileIds.length > claimBudget) {
    return { actionAccepted: false, stateChanged: false };
  }

  const isValid = isContiguousClaim(
    gameState,
    actingPlayerId,
    targetTileIds,
    tile => tile.ownerId === null && tile.typeId !== 'sea'
  );
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

  if (targetTileIds.length > claimBudget) {
    return { actionAccepted: false, stateChanged: true };
  }

  if (claimBudget === 0 && targetTileIds.length === 0) {
    gameState.turnState.playerTurns[actingPlayerId].hasActed = true;
    return { actionAccepted: true, stateChanged: true };
  }

  const isValid = isContiguousClaim(
    gameState,
    actingPlayerId,
    targetTileIds,
    tile => tile.ownerId === defenderId
  );
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
    roll: rollDie(),
  };
  gameState.turnState.defenseRolls[key] = defenseRoll;
  return defenseRoll;
}

function isContiguousClaim(
  gameState: GameState,
  actingPlayerId: number,
  targetTileIds: number[],
  canClaimTile: (tile: Tile) => boolean
): boolean {
  const remainingTargets = new Set(targetTileIds);
  const claimedThisPlan = new Set<number>();

  while (remainingTargets.size > 0) {
    const claimableNow = Array.from(remainingTargets).find(tileId => {
      const tile = gameState.tiles[tileId];
      if (!tile || !canClaimTile(tile)) return false;

      return tile.neighbors.some(neighborId => {
        const neighbor = gameState.tiles[neighborId];
        return neighbor?.ownerId === actingPlayerId || claimedThisPlan.has(neighborId);
      });
    });

    if (claimableNow === undefined) {
      return false;
    }

    remainingTargets.delete(claimableNow);
    claimedThisPlan.add(claimableNow);
  }

  return true;
}

function uniqueIds(ids: number[]): number[] {
  return Array.from(new Set(ids));
}

function getDefenseRollKey(attackerId: number, defenderId: number): string {
  return `${attackerId}:${defenderId}`;
}

function rollDie(): number {
  return Math.floor(Math.random() * 6) + 1;
}

function playerHasTiles(gameState: GameState, playerId: number): boolean {
  return Object.values(gameState.tiles).some(tile => tile.ownerId === playerId);
}
