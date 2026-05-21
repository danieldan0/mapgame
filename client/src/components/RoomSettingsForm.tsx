import React, { useState } from 'react';
import type { RoomSettingsRequest } from '../../../shared/src/types';

interface RoomSettingsFormProps {
  initialSettings?: Partial<RoomSettingsRequest>;
  submitLabel: string;
  onSubmit: (settings: RoomSettingsRequest) => void;
  onCancel?: () => void;
}

export const RoomSettingsForm: React.FC<RoomSettingsFormProps> = ({
  initialSettings,
  submitLabel,
  onSubmit,
  onCancel,
}) => {
  const [name, setName] = useState(initialSettings?.name ?? '');
  const [isPrivate, setIsPrivate] = useState(initialSettings?.isPrivate ?? false);
  const [password, setPassword] = useState(initialSettings?.password ?? '');
  const [maxPlayers, setMaxPlayers] = useState(initialSettings?.maxPlayers ?? 6);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit({
      name,
      isPrivate,
      password: password || undefined,
      maxPlayers,
    });
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 10 }}>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Room name"
        style={{ padding: '6px 10px' }}
      />
      <label>
        <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
        {' '}Private room
      </label>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Room password (optional)"
        style={{ padding: '6px 10px' }}
      />
      <label>
        Max players:{' '}
        <input
          type="number"
          min={2}
          max={99}
          value={maxPlayers}
          onChange={(e) => setMaxPlayers(Number(e.target.value))}
          style={{ width: 70, padding: '5px' }}
        />
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" style={{ padding: '8px 16px' }}>
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} style={{ padding: '8px 16px' }}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
};
