import React, { useState } from 'react';
import type { RoomInfo, UpdateRoomSettingsRequest } from '../../../shared/src/types';
import { RoomSettingsForm } from './RoomSettingsForm';

interface RoomProps {
  currentRoom: RoomInfo;
  socketId?: string;
  handleLeaveRoom: () => void;
  handleSetReady: (isReady: boolean) => void;
  handleSetColor: (color: number) => void;
  handleUpdateRoomSettings: (settings: UpdateRoomSettingsRequest) => void;
}

const PLAYER_COLOR_OPTIONS = [
  0xFF4500,
  0x1E90FF,
  0x32CD32,
  0xFFD700,
  0xBA55D3,
  0x00CED1,
];

function colorToHex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

export const Room: React.FC<RoomProps> = ({
  currentRoom,
  socketId,
  handleLeaveRoom,
  handleSetReady,
  handleSetColor,
  handleUpdateRoomSettings
}) => {
  const me = currentRoom.players.find(p => p.id === socketId);
  const isReady = me?.isReady || false;
  const takenColors = new Set(currentRoom.players.filter(p => p.id !== socketId).map(p => p.color));
  const inviteLink = `${window.location.origin}${window.location.pathname}?room=${currentRoom.id}`;
  const [customColor, setCustomColor] = useState(me ? colorToHex(me.color) : '#ff4500');
  const [isEditingSettings, setIsEditingSettings] = useState(false);
  const isHost = me !== undefined && me.playerId === currentRoom.hostPlayerId;

  const handleCustomColorChange = (value: string) => {
    setCustomColor(value);
    handleSetColor(Number.parseInt(value.slice(1), 16));
  };

  return (
    <div className="room-container" style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Room: {currentRoom.name}</h1>
      <button onClick={handleLeaveRoom} style={{ marginBottom: '20px' }}>Leave Room</button>

      <div style={{ marginBottom: 20, display: 'grid', gap: 6 }}>
        <div>
          {currentRoom.isPrivate ? 'Private' : 'Public'} room
          {currentRoom.hasPassword && ' - Password protected'}
          {' '}({currentRoom.players.length}/{currentRoom.maxPlayers} players)
        </div>
        <label>
          Invite link:
          <input readOnly value={inviteLink} style={{ marginLeft: 8, padding: 5, width: '70%' }} />
        </label>
      </div>

      {isHost && (
        <div style={{ marginBottom: 20 }}>
          <button onClick={() => setIsEditingSettings(!isEditingSettings)} style={{ padding: '6px 12px' }}>
            {isEditingSettings ? 'Close Settings' : 'Edit Room Settings'}
          </button>
          {isEditingSettings && (
            <div style={{ marginTop: 12, border: '1px solid #555', borderRadius: 6, padding: 12 }}>
              <RoomSettingsForm
                initialSettings={{
                  name: currentRoom.name,
                  isPrivate: currentRoom.isPrivate,
                  maxPlayers: currentRoom.maxPlayers,
                }}
                submitLabel="Save Settings"
                onSubmit={(settings) => {
                  handleUpdateRoomSettings(settings);
                  setIsEditingSettings(false);
                }}
              />
            </div>
          )}
        </div>
      )}

      <h2>Players</h2>
      <ul style={{ listStyleType: 'none', padding: 0 }}>
        {currentRoom.players.map(p => (
          <li key={p.id} style={{ padding: '5px 0' }}>
            <span
              aria-hidden="true"
              style={{
                display: 'inline-block',
                width: 12,
                height: 12,
                borderRadius: 2,
                backgroundColor: colorToHex(p.color),
                marginRight: 8,
                border: '1px solid rgba(0,0,0,0.2)',
              }}
            />
            {p.name} {p.id === socketId ? '(You)' : ''} - Player {p.playerId} - {p.isReady ? 'Ready' : 'Not Ready'}
          </li>
        ))}
      </ul>

      {me && (
        <div style={{ marginTop: '20px' }}>
          <h2>Color</h2>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {PLAYER_COLOR_OPTIONS.map(color => {
              const isSelected = me.color === color;
              const isTaken = takenColors.has(color);

              return (
                <button
                  key={color}
                  type="button"
                  onClick={() => handleSetColor(color)}
                  disabled={isTaken || isReady}
                  title={isTaken ? 'Taken' : colorToHex(color)}
                  aria-label={`Select color ${colorToHex(color)}`}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 4,
                    border: isSelected ? '3px solid #111' : '1px solid rgba(0,0,0,0.25)',
                    backgroundColor: colorToHex(color),
                    cursor: isTaken || isReady ? 'not-allowed' : 'pointer',
                    opacity: isTaken ? 0.35 : 1,
                  }}
                />
              );
            })}
          </div>
          <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
            Custom:
            <input
              type="color"
              value={customColor}
              disabled={isReady}
              onChange={(e) => handleCustomColorChange(e.target.value)}
            />
          </label>
        </div>
      )}

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
