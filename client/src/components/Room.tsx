import React from 'react';
import type { RoomInfo } from '../../../shared/src/types';

interface RoomProps {
  currentRoom: RoomInfo;
  socketId?: string;
  handleLeaveRoom: () => void;
  handleSetReady: (isReady: boolean) => void;
}

export const Room: React.FC<RoomProps> = ({
  currentRoom,
  socketId,
  handleLeaveRoom,
  handleSetReady
}) => {
  const me = currentRoom.players.find(p => p.id === socketId);
  const isReady = me?.isReady || false;

  return (
    <div className="room-container" style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Room: {currentRoom.name}</h1>
      <button onClick={handleLeaveRoom} style={{ marginBottom: '20px' }}>Leave Room</button>
      
      <h2>Players</h2>
      <ul style={{ listStyleType: 'none', padding: 0 }}>
        {currentRoom.players.map(p => (
          <li key={p.id} style={{ padding: '5px 0' }}>
            {p.name} {p.id === socketId ? '(You)' : ''} - {p.isReady ? '✅ Ready' : '❌ Not Ready'}
          </li>
        ))}
      </ul>

      <div style={{ marginTop: '20px' }}>
        <button 
          onClick={() => handleSetReady(!isReady)}
          style={{ 
            padding: '10px 20px', 
            fontSize: '16px',
            backgroundColor: isReady ? '#f44336' : '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          {isReady ? 'Unready' : 'Ready Up'}
        </button>
      </div>
      
      {currentRoom.players.length > 0 && !currentRoom.players.every(p => p.isReady) && (
        <p style={{ marginTop: '20px', color: '#666' }}>Waiting for all players to ready up...</p>
      )}
    </div>
  );
};
