import React, { useMemo } from 'react';
import { Map } from './Map';
import type { GameState } from '../../../shared/src/types';

interface ReplayViewerProps {
  turns: number[];
  currentTurn: number | null;
  snapshotState: GameState | null;
  onRequestTurn: (turn: number) => void;
  onClose: () => void;
}

export const ReplayViewer: React.FC<ReplayViewerProps> = ({
  turns,
  currentTurn,
  snapshotState,
  onRequestTurn,
  onClose,
}) => {
  const turnIndex = currentTurn !== null ? turns.indexOf(currentTurn) : -1;

  const playerTileCounts = useMemo(() => {
    if (!snapshotState) return {};
    const counts: Record<number, number> = {};
    for (const tile of Object.values(snapshotState.tiles)) {
      if (tile.ownerId !== null) {
        counts[tile.ownerId] = (counts[tile.ownerId] ?? 0) + 1;
      }
    }
    return counts;
  }, [snapshotState]);

  const emptySet = useMemo(() => new Set<number>(), []);

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 30, background: '#1a1a2e' }}>
      <Map
        gameState={snapshotState}
        claimableTileIds={emptySet}
        selectedTileIds={emptySet}
      />
      <div style={{ position: 'absolute', top: 20, left: 20, zIndex: 40, background: 'rgba(255,255,255,0.92)', padding: '12px 16px', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.3)', color: '#333', minWidth: 260 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 12 }}>
          <b>Turn History</b>
          <button onClick={onClose} style={{ padding: '2px 10px', cursor: 'pointer' }}>Close</button>
        </div>
        {turns.length === 0 ? (
          <div>No snapshots available yet.</div>
        ) : (
          <>
            <div style={{ marginBottom: 8, fontSize: 13 }}>
              {currentTurn !== null ? `Turn ${currentTurn}` : 'Select a turn'} / {turns[turns.length - 1]}
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10 }}>
              <button
                onClick={() => turnIndex > 0 && onRequestTurn(turns[turnIndex - 1])}
                disabled={turnIndex <= 0}
                style={{ padding: '3px 10px', cursor: turnIndex > 0 ? 'pointer' : 'not-allowed' }}
              >
                ◀
              </button>
              <input
                type="range"
                min={0}
                max={turns.length - 1}
                value={turnIndex >= 0 ? turnIndex : 0}
                onChange={e => onRequestTurn(turns[Number(e.target.value)])}
                style={{ flex: 1 }}
              />
              <button
                onClick={() => turnIndex < turns.length - 1 && onRequestTurn(turns[turnIndex + 1])}
                disabled={turnIndex >= turns.length - 1}
                style={{ padding: '3px 10px', cursor: turnIndex < turns.length - 1 ? 'pointer' : 'not-allowed' }}
              >
                ▶
              </button>
            </div>
            {snapshotState ? (
              <div>
                {Object.values(snapshotState.players)
                  .sort((a, b) => (playerTileCounts[b.id] ?? 0) - (playerTileCounts[a.id] ?? 0))
                  .map(player => (
                    <div key={player.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: 13 }}>
                      <div style={{ width: 12, height: 12, borderRadius: 2, background: `#${player.color.toString(16).padStart(6, '0')}`, flexShrink: 0, border: '1px solid #aaa' }} />
                      <span>{player.name}: {playerTileCounts[player.id] ?? 0} tiles</span>
                    </div>
                  ))}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: '#888' }}>Loading...</div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
