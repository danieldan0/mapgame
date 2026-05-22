import React, { useEffect, useMemo, useState } from 'react';
import { Map } from './Map';
import { MapSettingsForm } from './MapSettingsForm';
import type { GameAction, GameState, MapSettings, PlannedActionType, RoomInfo, Tile } from '../../../shared/src/types';

interface GameViewProps {
  currentRoom: RoomInfo | null;
  gameState: GameState | null;
  localPlayerId: number | null;
  onAction: (action: GameAction) => void;
  onPreviewAttack: (defenderId: number) => void;
  onRegenerate: (settings?: Partial<MapSettings>) => void;
  onLeaveRoom: () => void;
}

function getDefenseRollKey(attackerId: number, defenderId: number): string {
  return `${attackerId}:${defenderId}`;
}

function getDefenseRollLabel(gameState: GameState | null, attackerId: number | null, defenderId: number): string {
  if (!gameState || attackerId === null) return '...';
  const defenseRoll = gameState.turnState.defenseRolls[getDefenseRollKey(attackerId, defenderId)];
  return defenseRoll ? `${defenseRoll.roll}/d${defenseRoll.dieSize}` : '...';
}

const CLAIM_COST = 1;
const SEA_TRAVEL_COST = 3;

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
  const [isEditingMapSettings, setIsEditingMapSettings] = useState(false);

  const localPlayer = localPlayerId === null ? null : gameState?.players[localPlayerId] ?? null;
  const localTurn = localPlayerId === null ? null : gameState?.turnState.playerTurns[localPlayerId] ?? null;
  const enemyPlayers = Object.values(gameState?.players ?? {}).filter(player => player.id !== localPlayerId);
  const hasOwnedTiles = localPlayerId !== null && Object.values(gameState?.tiles ?? {}).some(tile => tile.ownerId === localPlayerId);
  const isPlacementPhase = gameState?.phase === 'placement';
  const hasConfirmed = isPlacementPhase && (localTurn?.hasActed ?? false);
  const canManageRoom = currentRoom?.players.find(p => p.playerId === localPlayerId)?.roles.some(r => r === 'host' || r === 'admin') ?? false;
  const myPlacedTileId = isPlacementPhase && localPlayerId !== null
    ? (Object.values(gameState?.tiles ?? {}).find(t => t.ownerId === localPlayerId)?.id ?? null)
    : null;

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

  const selectedPlanCost = useMemo(() => {
    if (!gameState || localPlayerId === null) return 0;

    return getPlanCost({
      gameState,
      localPlayerId,
      actionType,
      selectedTileIds,
      selectedDefenderId,
    });
  }, [actionType, gameState, localPlayerId, selectedDefenderId, selectedTileIds]);

  const claimableTileIds = useMemo(() => {
    if (!gameState || localPlayerId === null) return new Set<number>();

    if (isPlacementPhase) {
      if (hasConfirmed) return new Set<number>();
      return new Set(
        Object.values(gameState.tiles)
          .filter(tile => tile.typeId !== 'sea' && tile.ownerId === null)
          .map(tile => tile.id)
      );
    }

    if (localTurn?.hasActed || selectedPlanCost >= claimBudget) {
      return new Set<number>();
    }

    return getClaimableTileIds({
      gameState,
      localPlayerId,
      actionType,
      selectedTileIds,
      selectedDefenderId,
      remainingBudget: claimBudget - selectedPlanCost,
    });
  }, [actionType, claimBudget, gameState, hasConfirmed, isPlacementPhase, localPlayerId, localTurn?.hasActed, selectedDefenderId, selectedPlanCost, selectedTileIds]);

  const selectedTileIdSet = useMemo(() => new Set(selectedTileIds), [selectedTileIds]);
  const isCanceledAttack =
    actionType === 'ATTACK' &&
    lockedDefenderId !== null &&
    defenseRoll !== null &&
    claimBudget === 0;
  const canSubmitPlan = (selectedTileIds.length > 0 || isCanceledAttack) && selectedPlanCost <= claimBudget && !localTurn?.hasActed;

  useEffect(() => {
    setSelectedTileIds([]);
    setLockedDefenderId(null);
    setPlanNotice(null);
  }, [actionType, gameState?.turn, localPlayerId]);

  useEffect(() => {
    if (actionType === 'ATTACK' && selectedDefenderId !== null && defenseRoll === null) return;
    if (!gameState || localPlayerId === null) return;

    setSelectedTileIds(ids => trimSelectionToBudget({
      gameState,
      localPlayerId,
      actionType,
      selectedTileIds: ids,
      selectedDefenderId,
      claimBudget,
    }));
  }, [actionType, claimBudget, defenseRoll, gameState, localPlayerId, selectedDefenderId]);

  useEffect(() => {
    if (!gameState || localPlayerId === null || localTurn?.hasActed || selectedTileIds.length === 0) return;

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
  }, [actionType, gameState, localPlayerId, localTurn?.hasActed, selectedDefenderId, selectedTileIds]);

  const handlePolygonClick = (targetId: number) => {
    if (!gameState || localPlayerId === null) return;

    if (isPlacementPhase) {
      if (hasConfirmed || !claimableTileIds.has(targetId)) return;
      onAction({ type: 'PLACE_START', tileId: targetId });
      return;
    }

    if (localTurn?.hasActed) return;

    if (selectedTileIdSet.has(targetId)) {
      if (lockedDefenderId === null) {
        setSelectedTileIds(ids => ids.filter(id => id !== targetId));
        return;
      }

      const nextSelectedTileIds = selectedTileIds.filter(id => id !== targetId);
      const canRemoveTile =
        nextSelectedTileIds.length > 0 &&
        isSelectionStillValid({
          gameState,
          localPlayerId,
          actionType,
          selectedTileIds: nextSelectedTileIds,
          selectedDefenderId: lockedDefenderId,
        });

      if (canRemoveTile) {
        setSelectedTileIds(nextSelectedTileIds);
      }

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

    const submittedTileIds = selectedTileIds;
    const submittedDefenderId = lockedDefenderId;

    setSelectedTileIds([]);
    setLockedDefenderId(null);
    setPlanNotice(null);

    onAction({
      type: 'SUBMIT_PLAN',
      actionType,
      targetTileIds: submittedTileIds,
      defenderId: submittedDefenderId ?? undefined,
    });
  };

  const handleSkipTurn = () => {
    if (localTurn?.hasActed) return;

    setSelectedTileIds([]);
    setLockedDefenderId(null);
    setPlanNotice(null);
    onAction({ type: 'END_TURN' });
  };

  const handleRegenerate = (settings?: Partial<MapSettings>) => {
    setSelectedTileIds([]);
    setLockedDefenderId(null);
    setPlanNotice(null);
    setIsEditingMapSettings(false);
    onRegenerate(settings);
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 20, left: 20, zIndex: 10, background: 'rgba(255, 255, 255, 0.9)', padding: '10px 15px', borderRadius: '6px', color: '#333', boxShadow: '0 2px 4px rgba(0,0,0,0.2)', maxWidth: 360 }}>
        <div><b>Map Game</b></div>
        {currentRoom && <div style={{ fontSize: '12px', color: '#666' }}>Room: {currentRoom.name}</div>}
        <div style={{ marginTop: '5px' }}>
          Player: {localPlayer?.name ?? 'Joining...'}
          {enemyPlayers.length > 0 && ` | Opponents: ${enemyPlayers.map(player => player.name).join(', ')}`}
        </div>
        {isPlacementPhase ? (
          <>
            <div style={{ marginTop: '10px' }}>
              {hasConfirmed
                ? 'Waiting for other players to confirm their starting tile.'
                : myPlacedTileId !== null
                  ? 'Click a different tile to move, or confirm your position.'
                  : 'Click a highlighted tile to choose your starting position.'}
            </div>
            <div style={{ marginTop: '15px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                onClick={() => !hasConfirmed && myPlacedTileId !== null && onAction({ type: 'CONFIRM_PLACEMENT' })}
                disabled={myPlacedTileId === null || hasConfirmed}
                style={{ padding: '5px 10px', cursor: myPlacedTileId !== null && !hasConfirmed ? 'pointer' : 'not-allowed' }}
              >
                Confirm Position
              </button>
              <button onClick={onLeaveRoom} style={{ padding: '5px 10px', cursor: 'pointer', background: '#f44336', color: 'white', border: 'none', borderRadius: '2px' }}>
                Leave Match
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ marginTop: '8px' }}>
              Turn {gameState?.turn ?? '-'} | Roll: {localTurn ? `${localTurn.roll}/d${localTurn.dieSize}` : '-'} | Power: {localTurn?.power ?? '-'} | Points: {selectedPlanCost}/{claimBudget}
              {localTurn?.hasActed && ' | Action submitted'}
              {!hasOwnedTiles && ' | No tiles left'}
            </div>
            {actionType === 'ATTACK' && selectedDefenderId !== null && (
              <div style={{ marginTop: '6px' }}>
                Attack {localTurn ? `${localTurn.roll}/d${localTurn.dieSize}` : '-'} - Defense {getDefenseRollLabel(gameState, localPlayerId, selectedDefenderId)} = {defenseRoll === null ? '...' : claimBudget} claims vs {gameState?.players[selectedDefenderId]?.name}
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
              <button onClick={handleSkipTurn} disabled={localTurn?.hasActed} style={{ padding: '5px 10px', cursor: localTurn?.hasActed ? 'not-allowed' : 'pointer' }}>
                Skip Turn
              </button>
              {canManageRoom && (
                <button onClick={() => setIsEditingMapSettings(v => !v)} style={{ padding: '5px 10px', cursor: 'pointer' }}>
                  {isEditingMapSettings ? 'Close Map Settings' : 'Map Settings'}
                </button>
              )}
              <button onClick={onLeaveRoom} style={{ padding: '5px 10px', cursor: 'pointer', background: '#f44336', color: 'white', border: 'none', borderRadius: '2px' }}>
                Leave Match
              </button>
            </div>
          </>
        )}
      </div>
      <Map
        gameState={gameState}
        claimableTileIds={claimableTileIds}
        selectedTileIds={isPlacementPhase && myPlacedTileId !== null ? new Set([myPlacedTileId]) : selectedTileIdSet}
        onPolygonClick={handlePolygonClick}
      />
      {canManageRoom && isEditingMapSettings && currentRoom && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }}
          onClick={() => setIsEditingMapSettings(false)}
        >
          <div style={{ background: '#fff', color: '#333', borderRadius: 8, padding: '20px 24px', maxWidth: 480, width: '90%', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 4px 24px rgba(0,0,0,0.3)' }}
            onClick={e => e.stopPropagation()}
          >
            <h2 style={{ margin: '0 0 16px', color: '#333' }}>Map Settings</h2>
            <MapSettingsForm
              initialSettings={currentRoom.mapSettings}
              submitLabel="Save & Regenerate"
              onSubmit={handleRegenerate}
              onCancel={() => setIsEditingMapSettings(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

function getClaimableTileIds({
  gameState,
  localPlayerId,
  actionType,
  selectedTileIds,
  selectedDefenderId,
  remainingBudget,
}: {
  gameState: GameState;
  localPlayerId: number;
  actionType: PlannedActionType;
  selectedTileIds: number[];
  selectedDefenderId: number | null;
  remainingBudget: number;
}): Set<number> {
  const selectedTileIdSet = new Set(selectedTileIds);

  return new Set(
    Object.values(gameState.tiles)
      .filter(tile => !selectedTileIdSet.has(tile.id))
      .filter(tile => canClaimTile(tile, actionType, localPlayerId, selectedDefenderId))
      .filter(tile => getClaimCost(gameState, tile, localPlayerId, selectedTileIdSet) <= remainingBudget)
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

function getPlanCost({
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
}): number {
  const remainingTargets = new Set(selectedTileIds);
  const claimedThisPlan = new Set<number>();
  let totalCost = 0;

  while (remainingTargets.size > 0) {
    let cheapestClaim: { tileId: number; cost: number } | null = null;

    for (const tileId of remainingTargets) {
      const tile = gameState.tiles[tileId];
      if (!tile || !canClaimTile(tile, actionType, localPlayerId, selectedDefenderId)) continue;

      const cost = getClaimCost(gameState, tile, localPlayerId, claimedThisPlan);
      if (cost !== Infinity && (!cheapestClaim || cost < cheapestClaim.cost)) {
        cheapestClaim = { tileId, cost };
      }
    }

    if (!cheapestClaim) return Infinity;

    totalCost += cheapestClaim.cost;
    remainingTargets.delete(cheapestClaim.tileId);
    claimedThisPlan.add(cheapestClaim.tileId);
  }

  return totalCost;
}

function getClaimCost(
  gameState: GameState,
  targetTile: Tile,
  localPlayerId: number,
  selectedTileIds: Set<number>
): number {
  const visitedSeaTileIds = new Set<number>();
  const queue: Array<{ tileId: number; cost: number }> = [];

  for (const neighborId of targetTile.neighbors) {
    const neighbor = gameState.tiles[neighborId];
    if (!neighbor) continue;

    if (neighbor.ownerId === localPlayerId || selectedTileIds.has(neighborId)) {
      return CLAIM_COST;
    }

    if (neighbor.typeId === 'sea') {
      queue.push({ tileId: neighborId, cost: SEA_TRAVEL_COST + CLAIM_COST });
      visitedSeaTileIds.add(neighborId);
    }
  }

  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost);
    const current = queue.shift();
    if (!current) break;

    const tile = gameState.tiles[current.tileId];
    if (!tile) continue;

    for (const neighborId of tile.neighbors) {
      const neighbor = gameState.tiles[neighborId];
      if (!neighbor) continue;

      if (neighbor.ownerId === localPlayerId || selectedTileIds.has(neighborId)) {
        return current.cost;
      }

      if (neighbor.typeId === 'sea' && !visitedSeaTileIds.has(neighborId)) {
        visitedSeaTileIds.add(neighborId);
        queue.push({ tileId: neighborId, cost: current.cost + SEA_TRAVEL_COST });
      }
    }
  }

  return Infinity;
}

function trimSelectionToBudget({
  gameState,
  localPlayerId,
  actionType,
  selectedTileIds,
  selectedDefenderId,
  claimBudget,
}: {
  gameState: GameState;
  localPlayerId: number;
  actionType: PlannedActionType;
  selectedTileIds: number[];
  selectedDefenderId: number | null;
  claimBudget: number;
}): number[] {
  const trimmedTileIds = [...selectedTileIds];

  while (
    trimmedTileIds.length > 0 &&
    getPlanCost({ gameState, localPlayerId, actionType, selectedTileIds: trimmedTileIds, selectedDefenderId }) > claimBudget
  ) {
    trimmedTileIds.pop();
  }

  return trimmedTileIds;
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

      return getClaimCost(gameState, tile, localPlayerId, claimableTargets) !== Infinity;
    });

    if (nextClaimableTileId === undefined) {
      return false;
    }

    remainingTargets.delete(nextClaimableTileId);
    claimableTargets.add(nextClaimableTileId);
  }

  return true;
}
