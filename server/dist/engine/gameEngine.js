"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleAction = handleAction;
function handleAction(gameState, action, actingPlayerId) {
    let stateChanged = false;
    if (action.type === 'EXPAND') {
        const source = gameState.tiles[action.sourceTileId];
        const target = gameState.tiles[action.targetTileId];
        if (source && target &&
            source.ownerId === actingPlayerId && // Source belongs to player
            target.ownerId === null && // Target is unoccupied
            target.typeId !== 'sea' && // Cannot expand into sea yet
            source.neighbors.includes(target.id) // Must be adjacent
        ) {
            target.ownerId = actingPlayerId;
            stateChanged = true;
        }
    }
    if (action.type === 'ATTACK') {
        const source = gameState.tiles[action.sourceTileId];
        const target = gameState.tiles[action.targetTileId];
        if (source && target &&
            source.ownerId === actingPlayerId && // Source belongs to player
            target.ownerId !== null && target.ownerId !== actingPlayerId && // Target is enemy
            source.neighbors.includes(target.id) // Must be adjacent
        ) {
            // Simple dice roll combat 
            const attackerRoll = Math.floor(Math.random() * 6) + 1;
            const defenderRoll = Math.floor(Math.random() * 6) + 1;
            // Attack succeeds on tie or greater for this simple prototype
            if (attackerRoll >= defenderRoll) {
                target.ownerId = actingPlayerId;
                stateChanged = true;
            }
        }
    }
    return stateChanged;
}
