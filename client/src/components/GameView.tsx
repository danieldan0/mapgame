import React, { useState } from 'react';
import { Map } from './Map';
import type { GameAction, GameState, RoomInfo } from '../../../shared/src/types';

interface GameViewProps {
  currentRoom: RoomInfo | null;
  gameState: GameState | null;
  localPlayerId: number | null;
  onAction: (action: GameAction) => void;
  onRegenerate: () => void;
  onLeaveRoom: () => void;
}

export const GameView: React.FC<GameViewProps> = ({
  currentRoom,
  gameState,
  localPlayerId,
  onAction,
  onRegenerate,
  onLeaveRoom
}) => {
  const [selectedTileId, setSelectedTileId] = useState<number | null>(null);
  const localPlayer = localPlayerId === null ? null : gameState?.players[localPlayerId] ?? null;
  const enemyPlayers = Object.values(gameState?.players ?? {}).filter(player => player.id !== localPlayerId);

  const handlePolygonClick = (targetId: number) => {
    if (!gameState || localPlayerId === null) return;

    const targetTile = gameState.tiles[targetId];
    if (!targetTile) return;

    if (targetTile.ownerId === localPlayerId) {
      setSelectedTileId(targetId);
      return;
    }

    if (selectedTileId === null) return;

    const sourceTile = gameState.tiles[selectedTileId];
    if (!sourceTile || !sourceTile.neighbors.includes(targetId)) {
      setSelectedTileId(null);
      return;
    }

    if (targetTile.ownerId === null && targetTile.typeId !== 'sea') {
      onAction({
        type: 'EXPAND',
        sourceTileId: selectedTileId,
        targetTileId: targetId,
      });
    } else if (targetTile.ownerId !== null && targetTile.ownerId !== localPlayerId) {
      onAction({
        type: 'ATTACK',
        sourceTileId: selectedTileId,
        targetTileId: targetId,
      });
    }
  };

  const handleRegenerate = () => {
    setSelectedTileId(null);
    onRegenerate();
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 20, left: 20, zIndex: 10, background: 'rgba(255, 255, 255, 0.9)', padding: '10px 15px', borderRadius: '6px', color: '#333', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
        <div><b>Map Game</b></div>
        {currentRoom && <div style={{ fontSize: '12px', color: '#666' }}>Room: {currentRoom.name}</div>}
        <div style={{ marginTop: '5px' }}>
          Player: {localPlayer?.name ?? 'Joining...'}
          {enemyPlayers.length > 0 && ` | Opponents: ${enemyPlayers.map(player => player.name).join(', ')}`}
        </div>
        <div style={{ marginTop: '10px' }}>
          {selectedTileId !== null ? `Selected Tile: ${selectedTileId} (Click adjacent to expand/attack)` : 'Click one of your tiles to select'}
        </div>
        <div style={{ marginTop: '15px', display: 'flex', gap: '10px' }}>
          <button onClick={handleRegenerate} style={{ padding: '5px 10px', cursor: 'pointer' }}>
            Regenerate Map
          </button>
          <button onClick={onLeaveRoom} style={{ padding: '5px 10px', cursor: 'pointer', background: '#f44336', color: 'white', border: 'none', borderRadius: '2px' }}>
            Leave Match
          </button>
        </div>
      </div>
      <Map gameState={gameState} onPolygonClick={handlePolygonClick} />
    </div>
  );
};
