import React, { useState } from 'react';
import type { RoomInfo } from '../../../shared/src/types';

interface LobbyProps {
  roomsList: RoomInfo[];
  onCreateRoom: (playerName: string) => void;
  onJoinRoom: (roomId: string, playerName: string) => void;
}

export const Lobby: React.FC<LobbyProps> = ({
  roomsList,
  onCreateRoom,
  onJoinRoom
}) => {
  const [playerName, setPlayerName] = useState('');

  const handleCreateRoom = () => {
    onCreateRoom(playerName);
  };

  const handleJoinRoom = (roomId: string) => {
    onJoinRoom(roomId, playerName);
  };

  return (
    <div className="lobby-container" style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Game Lobby</h1>
      <div style={{ marginBottom: '20px' }}>
        <label>
          Your Name:
          <input 
            type="text" 
            value={playerName} 
            onChange={(e) => setPlayerName(e.target.value)}
            style={{ marginLeft: '10px', padding: '5px' }}
            placeholder="Enter your name"
          />
        </label>
      </div>
      
      <div style={{ marginBottom: '20px' }}>
        <button onClick={handleCreateRoom} style={{ padding: '10px 20px', fontSize: '16px' }}>
          Create New Room
        </button>
      </div>

      <h2>Available Rooms</h2>
      {roomsList.length === 0 ? (
        <p>No rooms available. Create one!</p>
      ) : (
        <ul style={{ listStyleType: 'none', padding: 0 }}>
          {roomsList.map(room => (
            <li key={room.id} style={{ border: '1px solid #ccc', padding: '10px', marginBottom: '10px', borderRadius: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>{room.name}</strong> - Status: {room.status} ({room.players.length} players)
              </div>
              <button 
                onClick={() => handleJoinRoom(room.id)}
                disabled={room.status !== 'waiting'}
                style={{ padding: '5px 10px' }}
              >
                Join
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
