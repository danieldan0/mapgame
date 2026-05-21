import React, { useState } from 'react';
import type { RoomInfo } from '../../../shared/src/types';
import { AccountPanel } from './AccountPanel';

interface LobbyProps {
  roomsList: RoomInfo[];
  onCreateRoom: (playerName: string) => void;
  onJoinRoom: (roomId: string, playerName: string) => void;
  reconnectInfo?: { roomId: string; roomName: string } | null;
  onReconnect?: () => void;
  onDismissReconnect?: () => void;
  accountUsername: string | null;
  authError: string | null;
  onLogin: (username: string, password: string) => void;
  onRegister: (username: string, password: string) => void;
  onLogout: () => void;
  onDismissAuthError: () => void;
}

export const Lobby: React.FC<LobbyProps> = ({
  roomsList,
  onCreateRoom,
  onJoinRoom,
  reconnectInfo,
  onReconnect,
  onDismissReconnect,
  accountUsername,
  authError,
  onLogin,
  onRegister,
  onLogout,
  onDismissAuthError,
}) => {
  const [playerName, setPlayerName] = useState(() => localStorage.getItem('mapgame_player_name') || '');

  return (
    <div className="lobby-container" style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Game Lobby</h1>

      {reconnectInfo && (
        <div style={{
          background: '#1a2e1a',
          border: '1px solid #3a6b3a',
          borderRadius: '6px',
          padding: '12px 16px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}>
          <span>Active game: <strong>{reconnectInfo.roomName}</strong></span>
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <button onClick={onReconnect} style={{ padding: '6px 14px', background: '#2d7a2d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
              Rejoin
            </button>
            <button onClick={onDismissReconnect} style={{ padding: '6px 14px', background: '#444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
              Dismiss
            </button>
          </div>
        </div>
      )}

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

      <div style={{ marginBottom: '24px' }}>
        <AccountPanel
          accountUsername={accountUsername}
          authError={authError}
          onLogin={onLogin}
          onRegister={onRegister}
          onLogout={onLogout}
          onDismissAuthError={onDismissAuthError}
        />
      </div>

      <div style={{ marginBottom: '20px' }}>
        <button onClick={() => onCreateRoom(playerName)} style={{ padding: '10px 20px', fontSize: '16px' }}>
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
                <strong>{room.name}</strong> — {room.status} ({room.players.length} players)
              </div>
              <button
                onClick={() => onJoinRoom(room.id, playerName)}
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
