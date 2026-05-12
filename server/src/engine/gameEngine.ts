import type { GameState, GameAction } from '@mapgame/shared';

export function handleAction(gameState: GameState, action: GameAction, actingPlayerId: number): boolean {
  let stateChanged = false;

  if (action.type === 'EXPAND') {
    const source = gameState.tiles[action.sourceTileId];
    const target = gameState.tiles[action.targetTileId];

    if (
      source && target && 
      source.ownerId === actingPlayerId && // Source belongs to player
      target.ownerId === null &&           // Target is unoccupied
      target.typeId !== 'sea' &&           // Cannot expand into sea yet
      source.neighbors.includes(target.id) // Must be adjacent
    ) {
      target.ownerId = actingPlayerId;
      stateChanged = true;
    }
  }

  if (action.type === 'ATTACK') {
    const source = gameState.tiles[action.sourceTileId];
    const target = gameState.tiles[action.targetTileId];

    if (
      source && target && 
      source.ownerId === actingPlayerId && // Source belongs to player
      target.ownerId !== null && target.ownerId !== actingPlayerId && // Target is enemy
      source.neighbors.includes(target.id) // Must be adjacent
    ) {
      const attackerRoll = Math.floor(Math.random() * 6) + 1;
      const defenderRoll = Math.floor(Math.random() * 6) + 1;
      
      if (attackerRoll >= defenderRoll) {
        target.ownerId = actingPlayerId;
        stateChanged = true;
      }
    }
  }

  return stateChanged;
}
