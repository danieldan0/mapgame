import React, { useState } from 'react';
import type { CreateRoomRequest } from '../../../shared/src/types';
import { RoomSettingsForm } from './RoomSettingsForm';

interface CreateRoomProps {
  onCreateRoom: (settings: CreateRoomRequest, playerName: string) => void;
  onCancel: () => void;
}

export const CreateRoom: React.FC<CreateRoomProps> = ({ onCreateRoom, onCancel }) => {
  const [playerName, setPlayerName] = useState(() => localStorage.getItem('mapgame_player_name') || '');

  return (
    <div style={{ padding: 20, maxWidth: 600, margin: '0 auto' }}>
      <h1>Create Room</h1>
      <div style={{ marginBottom: 20 }}>
        <label>
          Your Name:
          <input
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            style={{ marginLeft: 10, padding: 5 }}
            placeholder="Enter your name"
          />
        </label>
      </div>
      <RoomSettingsForm
        submitLabel="Create Room"
        onSubmit={(settings) => onCreateRoom(settings, playerName)}
        onCancel={onCancel}
      />
    </div>
  );
};
