import React, { useEffect, useMemo, useState } from 'react';
import { Map } from './Map';
import type { GameAction, GameState, PlannedActionType, RoomInfo, Tile } from '../../../shared/src/types';

interface GameViewProps {
  currentRoom: RoomInfo | null;
  gameState: GameState | null;
  localPlayerId: number | null;
  onAction: (action: GameAction) => void;
  onPreviewAttack: (defenderId: number) => void;
  onRegenerate: () => void;
  onLeaveRoom: () => void;
}

function getDefenseRollKey(attackerId: number, defenderId: number): string {
  return `${attackerId}:${defenderId}`;
}

export const GameView: React.FC<GameViewProps> = ({
  currentRoom,
  gameState,
  localPlayerId,
  onAction,
  onPreviewAttack,
  onRegenerate,
  onLeaveRoom
}) => {
  const [actionType, setActionType] = useState<PlannedActionType>('EXPAND');
  const [selectedTileIds, setSelectedTileIds] = useState<number[]>([]);
  const [lockedDefenderId, setLockedDefenderId] = useState<number | null>(null);
  const [planNotice, setPlanNotice] = useState<string | null>(null);

  const localPlayer = localPlayerId === null ? null : gameState?.players[localPlayerId] ?? null;
  const localTurn = localPlayerId === null ? null : gameState?.turnState.playerTurns[localPlayerId] ?? null;
  const enemyPlayers = Object.values(gameState?.players ?? {}).filter(player => player.id !== localPlayerId);

  const selectedDefenderId = useMemo(() => {
    if (lockedDefenderId !== null) return lockedDefenderId;
    if (!gameState || selectedTileIds.length === 0) return null;
    const ownerId = gameState.tiles[selectedTileIds[0]]?.ownerId ?? null;
    return ownerId !== null && ownerId !== localPlayerId ? ownerId : null;
  }, [gameState, localPlayerId, lockedDefenderId, selectedTileIds]);

  const defenseRoll = useMemo(() => {
    if (!gameState || localPlayerId === null || selectedDefenderId === null) return null;
    return gameState.turnState.defenseRolls[getDefenseRollKey(localPlayerId, selectedDefenderId)]?.roll ?? null;
  }, [gameState, localPlayerId, selectedDefenderId]);

  const claimBudget = useMemo(() => {
    if (!localTurn) return 0;
    if (actionType === 'EXPAND') return localTurn.roll;
    if (selectedDefenderId === null) return localTurn.roll;
    if (defenseRoll === null) return 0;
    return Math.max(0, localTurn.roll - defenseRoll);
  }, [actionType, defenseRoll, localTurn, selectedDefenderId]);

  const claimableTileIds = useMemo(() => {
    if (!gameState || localPlayerId === null || localTurn?.hasActed || selectedTileIds.length >= claimBudget) {
      return new Set<number>();
    }

    return getClaimableTileIds({
      gameState,
      localPlayerId,
      actionType,
      selectedTileIds,
      selectedDefenderId,
    });
  }, [actionType, claimBudget, gameState, localPlayerId, localTurn?.hasActed, selectedDefenderId, selectedTileIds]);

  const selectedTileIdSet = useMemo(() => new Set(selectedTileIds), [selectedTileIds]);
  const isCanceledAttack =
    actionType === 'ATTACK' &&
    lockedDefenderId !== null &&
    defenseRoll !== null &&
    claimBudget === 0;
  const canSubmitPlan = (selectedTileIds.length > 0 || isCanceledAttack) && !localTurn?.hasActed;

  useEffect(() => {
    setSelectedTileIds([]);
    setLockedDefenderId(null);
    setPlanNotice(null);
  }, [actionType, gameState?.turn, localPlayerId]);

  useEffect(() => {
    if (actionType === 'ATTACK' && selectedDefenderId !== null && defenseRoll === null) return;
    setSelectedTileIds(ids => ids.length > claimBudget ? ids.slice(0, claimBudget) : ids);
  }, [actionType, claimBudget, defenseRoll, selectedDefenderId]);

  useEffect(() => {
    if (!gameState || localPlayerId === null || selectedTileIds.length === 0) return;

    const stillValid = isSelectionStillValid({
      gameState,
      localPlayerId,
      actionType,
      selectedTileIds,
      selectedDefenderId,
    });

    if (!stillValid) {
      setSelectedTileIds([]);
      setLockedDefenderId(null);
      setPlanNotice('Your current plan became impossible because the board changed.');
    }
  }, [actionType, gameState, localPlayerId, selectedDefenderId, selectedTileIds]);

  const handlePolygonClick = (targetId: number) => {
    if (!gameState || localPlayerId === null || localTurn?.hasActed) return;

    if (selectedTileIdSet.has(targetId) && lockedDefenderId === null) {
      setSelectedTileIds(ids => ids.filter(id => id !== targetId));
      return;
    }

    if (claimableTileIds.has(targetId)) {
      const targetOwnerId = gameState.tiles[targetId]?.ownerId ?? null;

      if (actionType === 'ATTACK' && targetOwnerId !== null && targetOwnerId !== localPlayerId) {
        if (lockedDefenderId === null) {
          setLockedDefenderId(targetOwnerId);
          onPreviewAttack(targetOwnerId);
        }
      }

      setPlanNotice(null);
      setSelectedTileIds(ids => [...ids, targetId]);
    }
  };

  const handleActionTypeChange = (nextActionType: PlannedActionType) => {
    if (lockedDefenderId !== null) return;
    setActionType(nextActionType);
  };

  const handleSubmitPlan = () => {
    if (!canSubmitPlan) return;

    onAction({
      type: 'SUBMIT_PLAN',
      actionType,
      targetTileIds: selectedTileIds,
      defenderId: lockedDefenderId ?? undefined,
    });
  };

  const handleRegenerate = () => {
    setSelectedTileIds([]);
    setLockedDefenderId(null);
    setPlanNotice(null);
    onRegenerate();
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 20, left: 20, zIndex: 10, background: 'rgba(255, 255, 255, 0.9)', padding: '10px 15px', borderRadius: '6px', color: '#333', boxShadow: '0 2px 4px rgba(0,0,0,0.2)', maxWidth: 360 }}>
        <div><b>Map Game</b></div>
        {currentRoom && <div style={{ fontSize: '12px', color: '#666' }}>Room: {currentRoom.name}</div>}
        <div style={{ marginTop: '5px' }}>
          Turn {gameState?.turn ?? '-'} | Player: {localPlayer?.name ?? 'Joining...'}
          {enemyPlayers.length > 0 && ` | Opponents: ${enemyPlayers.map(player => player.name).join(', ')}`}
        </div>
        <div style={{ marginTop: '8px' }}>
          Roll: {localTurn?.roll ?? '-'} | Claims: {selectedTileIds.length}/{claimBudget}
          {localTurn?.hasActed && ' | Action submitted'}
        </div>
        {actionType === 'ATTACK' && selectedDefenderId !== null && (
          <div style={{ marginTop: '6px' }}>
            Attack {localTurn?.roll ?? '-'} - Defense {defenseRoll ?? '...'} = {defenseRoll === null ? '...' : claimBudget} claims vs {gameState?.players[selectedDefenderId]?.name}
          </div>
        )}
        {planNotice && (
          <div style={{ marginTop: '8px', color: '#b45309' }}>
            {planNotice}
          </div>
        )}
        <div style={{ marginTop: '10px', display: 'flex', gap: 8 }}>
          <button
            onClick={() => handleActionTypeChange('EXPAND')}
            disabled={localTurn?.hasActed || lockedDefenderId !== null}
            style={{ padding: '5px 10px', cursor: localTurn?.hasActed || lockedDefenderId !== null ? 'not-allowed' : 'pointer', fontWeight: actionType === 'EXPAND' ? 700 : 400 }}
          >
            Expand
          </button>
          <button
            onClick={() => handleActionTypeChange('ATTACK')}
            disabled={localTurn?.hasActed || lockedDefenderId !== null}
            style={{ padding: '5px 10px', cursor: localTurn?.hasActed || lockedDefenderId !== null ? 'not-allowed' : 'pointer', fontWeight: actionType === 'ATTACK' ? 700 : 400 }}
          >
            Attack
          </button>
        </div>
        <div style={{ marginTop: '10px' }}>
          {localTurn?.hasActed
            ? 'Waiting for other players to act.'
            : selectedTileIds.length > 0
              ? lockedDefenderId === null ? 'Highlighted tiles can be added to this plan.' : 'Attack locked. Highlighted tiles can be added if the attack result allows it.'
              : `Select highlighted tiles to ${actionType.toLowerCase()}.`}
        </div>
        <div style={{ marginTop: '15px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button onClick={handleSubmitPlan} disabled={!canSubmitPlan} style={{ padding: '5px 10px', cursor: canSubmitPlan ? 'pointer' : 'not-allowed' }}>
            Submit Plan
          </button>
          <button onClick={handleRegenerate} style={{ padding: '5px 10px', cursor: 'pointer' }}>
            Regenerate Map
          </button>
          <button onClick={onLeaveRoom} style={{ padding: '5px 10px', cursor: 'pointer', background: '#f44336', color: 'white', border: 'none', borderRadius: '2px' }}>
            Leave Match
          </button>
        </div>
      </div>
      <Map
        gameState={gameState}
        claimableTileIds={claimableTileIds}
        selectedTileIds={selectedTileIdSet}
        onPolygonClick={handlePolygonClick}
      />
    </div>
  );
};

function getClaimableTileIds({
  gameState,
  localPlayerId,
  actionType,
  selectedTileIds,
  selectedDefenderId,
}: {
  gameState: GameState;
  localPlayerId: number;
  actionType: PlannedActionType;
  selectedTileIds: number[];
  selectedDefenderId: number | null;
}): Set<number> {
  const selectedTileIdSet = new Set(selectedTileIds);

  return new Set(
    Object.values(gameState.tiles)
      .filter(tile => !selectedTileIdSet.has(tile.id))
      .filter(tile => canClaimTile(tile, actionType, localPlayerId, selectedDefenderId))
      .filter(tile => isAdjacentToOwnedOrSelected(gameState, tile, localPlayerId, selectedTileIdSet))
      .map(tile => tile.id)
  );
}

function canClaimTile(
  tile: Tile,
  actionType: PlannedActionType,
  localPlayerId: number,
  selectedDefenderId: number | null
): boolean {
  if (actionType === 'EXPAND') {
    return tile.ownerId === null && tile.typeId !== 'sea';
  }

  if (selectedDefenderId !== null) {
    return tile.ownerId === selectedDefenderId;
  }

  return tile.ownerId !== null && tile.ownerId !== localPlayerId;
}

function isAdjacentToOwnedOrSelected(
  gameState: GameState,
  tile: Tile,
  localPlayerId: number,
  selectedTileIds: Set<number>
): boolean {
  return tile.neighbors.some(neighborId => {
    const neighbor = gameState.tiles[neighborId];
    return neighbor?.ownerId === localPlayerId || selectedTileIds.has(neighborId);
  });
}

function isSelectionStillValid({
  gameState,
  localPlayerId,
  actionType,
  selectedTileIds,
  selectedDefenderId,
}: {
  gameState: GameState;
  localPlayerId: number;
  actionType: PlannedActionType;
  selectedTileIds: number[];
  selectedDefenderId: number | null;
}): boolean {
  const remainingTargets = new Set(selectedTileIds);
  const claimableTargets = new Set<number>();

  while (remainingTargets.size > 0) {
    const nextClaimableTileId = Array.from(remainingTargets).find(tileId => {
      const tile = gameState.tiles[tileId];
      if (!tile || !canClaimTile(tile, actionType, localPlayerId, selectedDefenderId)) return false;

      return tile.neighbors.some(neighborId => {
        const neighbor = gameState.tiles[neighborId];
        return neighbor?.ownerId === localPlayerId || claimableTargets.has(neighborId);
      });
    });

    if (nextClaimableTileId === undefined) {
      return false;
    }

    remainingTargets.delete(nextClaimableTileId);
    claimableTargets.add(nextClaimableTileId);
  }

  return true;
}
