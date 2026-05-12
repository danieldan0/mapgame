import { useState, useEffect } from 'react'
import { Map } from './components/Map.tsx'
import { io } from 'socket.io-client'
import type { GameState, GameAction } from '../../shared/src/types.ts'

const socket = io('http://localhost:3000');

// Hardcoded for singleplayer prototype
const LOCAL_PLAYER_ID = 1;

function App() {
  const [selectedTileId, setSelectedTileId] = useState<number | null>(null)
  const [gameState, setGameState] = useState<GameState | null>(null)

  useEffect(() => {
    socket.on('gameState', (newGameState: GameState) => {
      setGameState(newGameState);
    });

    return () => {
      socket.off('gameState');
    };
  }, []);

  const handlePolygonClick = (targetId: number) => {
    if (!gameState) return;
    
    const targetTile = gameState.tiles[targetId];
    if (!targetTile) return;

    if (targetTile.ownerId === LOCAL_PLAYER_ID) {
      setSelectedTileId(targetId);
      console.log(`Selected tile: ${targetId}`);
      return;
    }

    if (selectedTileId !== null) {
      const sourceTile = gameState.tiles[selectedTileId];
      
      if (sourceTile && sourceTile.neighbors.includes(targetId)) {
        if (targetTile.ownerId === null && targetTile.typeId !== 'sea') {
          const action: GameAction = { type: 'EXPAND', sourceTileId: selectedTileId, targetTileId: targetId };
          socket.emit('action', action);
          console.log('Action: EXPAND sent');
        } else if (targetTile.ownerId !== null && targetTile.ownerId !== LOCAL_PLAYER_ID) {
          const action: GameAction = { type: 'ATTACK', sourceTileId: selectedTileId, targetTileId: targetId };
          socket.emit('action', action);
          console.log('Action: ATTACK sent');
        }
      } else {
        setSelectedTileId(null);
      }
    }
  }

  const handleRegenerate = () => {
    socket.emit('regenerateMap');
    setSelectedTileId(null);
  }

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 20, left: 20, zIndex: 10, background: 'rgba(255, 255, 255, 0.9)', padding: '10px 15px', borderRadius: '6px', color: '#333' }}>
        <div><b>Map Game Prototype</b></div>
        <div style={{ marginTop: '5px' }}>Player: Red | Enemy: Blue</div>
        <div style={{ marginTop: '10px' }}>
          {selectedTileId !== null ? `Selected Tile: ${selectedTileId} (Click adjacent to expand/attack)` : 'Click one of your (Red) tiles to select'}
        </div>
        <button onClick={handleRegenerate} style={{ marginTop: '15px', padding: '5px 10px', cursor: 'pointer' }}>
          Regenerate Map
        </button>
      </div>
      <Map gameState={gameState} onPolygonClick={handlePolygonClick} />
    </div>
  )
}

export default App
