import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import { CreateRoom } from './components/CreateRoom.tsx'
import { GameView } from './components/GameView.tsx'
import { Lobby } from './components/Lobby.tsx'
import { Room } from './components/Room.tsx'
import { useAuth } from './hooks/useAuth.ts'
import type { CreateRoomRequest, GameAction, GameState, InviteRoomInfo, JoinRoomRequest, MapSettings, RoleUpdateRequest, RoomInfo, RoomRole, TransferHostRequest, UpdateRoomSettingsRequest } from '../../shared/src/types.ts'
import './App.css'

const socketUrl = import.meta.env.VITE_SOCKET_URL ?? `${window.location.protocol}//${window.location.hostname}:3000`;
const socket = io(socketUrl);

type ViewState = 'LOBBY' | 'CREATE_ROOM' | 'ROOM' | 'GAME';

function App() {
  const [viewState, setViewState] = useState<ViewState>('LOBBY');
  const [roomsList, setRoomsList] = useState<RoomInfo[]>([]);
  const [currentRoom, setCurrentRoom] = useState<RoomInfo | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [previewState, setPreviewState] = useState<GameState | null>(null);
  const [reconnectInfo, setReconnectInfo] = useState<{ roomId: string; roomName: string } | null>(null);
  const [inviteRoomId, setInviteRoomId] = useState<string | null>(() => new URLSearchParams(window.location.search).get('room'));

  const { accountUsername, authError, login, register, logout, dismissAuthError } = useAuth(socket);

  useEffect(() => {
    const doAuthenticate = () => {
      const token = localStorage.getItem('mapgame_token') ?? undefined;
      socket.emit('authenticate', token);
      const roomId = new URLSearchParams(window.location.search).get('room');
      if (roomId) {
        socket.emit('getInviteRoomInfo', roomId);
      }
    };

    socket.on('connect', doAuthenticate);
    if (socket.connected) doAuthenticate();

    socket.on('reconnectAvailable', (info: { roomId: string; roomName: string }) => {
      setReconnectInfo(info);
    });

    socket.on('roomsList', (rooms: RoomInfo[]) => {
      setRoomsList(rooms);
    });

    socket.on('roomUpdate', (room: RoomInfo) => {
      setCurrentRoom(room);
      if (room.status === 'waiting') {
        setViewState('ROOM');
      }
    });

    socket.on('gameStarted', () => {
      setViewState('GAME');
    });

    socket.on('gameState', (newGameState: GameState) => {
      setGameState(newGameState);
    });

    socket.on('mapPreview', (preview: GameState) => {
      setPreviewState(preview);
    });

    socket.on('error', (msg: string) => {
      alert(`Error: ${msg}`);
    });

    socket.on('kicked', (msg: string) => {
      alert(`Disconnected: ${msg}`);
      window.location.reload();
    });

    socket.on('inviteRoomInfo', (info: InviteRoomInfo) => {
      const playerName = localStorage.getItem('mapgame_player_name') || '';
      const password = info.hasPassword ? window.prompt(`Password for ${info.roomName}`) ?? undefined : undefined;
      if (info.hasPassword && !password) {
        setInviteRoomId(null);
        return;
      }
      if (playerName) {
        socket.emit('setName', playerName);
      }
      socket.emit('joinRoom', { roomId: info.roomId, password });
      setInviteRoomId(null);
      window.history.replaceState({}, '', window.location.pathname);
    });

    socket.on('inviteRoomError', (msg: string) => {
      alert(`Invite error: ${msg}`);
      setInviteRoomId(null);
      window.history.replaceState({}, '', window.location.pathname);
    });

    return () => {
      socket.off('connect', doAuthenticate);
      socket.off('reconnectAvailable');
      socket.off('roomsList');
      socket.off('roomUpdate');
      socket.off('gameStarted');
      socket.off('gameState');
      socket.off('mapPreview');
      socket.off('error');
      socket.off('kicked');
      socket.off('inviteRoomInfo');
      socket.off('inviteRoomError');
    };
  }, []);

  useEffect(() => {
    if (!inviteRoomId || !socket.connected) return;
    socket.emit('getInviteRoomInfo', inviteRoomId);
  }, [inviteRoomId]);

  const handleReconnect = () => {
    if (!reconnectInfo) return;
    const roomId = reconnectInfo.roomId;
    setReconnectInfo(null);
    socket.emit('joinRoom', { roomId });
  };

  const handleCreateRoom = (settings: CreateRoomRequest, playerName: string) => {
    setReconnectInfo(null);
    const roomOwnerName = playerName.trim() || 'Player';
    socket.emit('setName', roomOwnerName);
    socket.emit('createRoom', {
      ...settings,
      name: settings.name.trim() || `${roomOwnerName}'s Room`,
    });
  };

  const handleJoinRoom = (request: JoinRoomRequest, playerName: string) => {
    setReconnectInfo(null);
    const trimmedName = playerName.trim();
    if (trimmedName) {
      socket.emit('setName', trimmedName);
    }
    socket.emit('joinRoom', request);
    setInviteRoomId(null);
  };

  const handleLeaveRoom = () => {
    socket.emit('leaveRoom');
    setCurrentRoom(null);
    setGameState(null);
    setPreviewState(null);
    setViewState('LOBBY');
  };

  const handleSetReady = (isReady: boolean) => {
    socket.emit('setReady', isReady);
  };

  const handleSetColor = (color: number) => {
    socket.emit('setColor', color);
  };

  const handleUpdateRoomSettings = (settings: UpdateRoomSettingsRequest) => {
    socket.emit('updateRoomSettings', settings);
  };

  const handleKickPlayer = (targetSocketId: string) => {
    socket.emit('kickPlayer', targetSocketId);
  };

  const handleUpdatePlayerRole = (request: RoleUpdateRequest) => {
    socket.emit('updatePlayerRole', request);
  };

  const handleSetParticipantRole = (role: Extract<RoomRole, 'player' | 'spectator'>) => {
    socket.emit('setParticipantRole', role);
  };

  const handleTransferHost = (request: TransferHostRequest) => {
    socket.emit('transferHost', request);
  };

  const handleAction = (action: GameAction) => {
    socket.emit('action', action);
  };

  const handlePreviewAttack = (defenderId: number) => {
    socket.emit('previewAttack', defenderId);
  };

  const handleRegenerate = (settings?: Partial<MapSettings>) => {
    socket.emit('regenerateMap', settings);
  };

  if (viewState === 'LOBBY') {
    return (
      <Lobby
        roomsList={roomsList}
        onOpenCreateRoom={() => setViewState('CREATE_ROOM')}
        onJoinRoom={handleJoinRoom}
        reconnectInfo={reconnectInfo}
        onReconnect={handleReconnect}
        onDismissReconnect={() => setReconnectInfo(null)}
        accountUsername={accountUsername}
        authError={authError}
        onLogin={login}
        onRegister={register}
        onLogout={logout}
        onDismissAuthError={dismissAuthError}
      />
    );
  }

  if (viewState === 'CREATE_ROOM') {
    return (
      <CreateRoom
        onCreateRoom={handleCreateRoom}
        onCancel={() => setViewState('LOBBY')}
      />
    );
  }

  if (viewState === 'ROOM' && currentRoom) {
    return (
      <Room
        currentRoom={currentRoom}
        socketId={socket.id}
        previewState={previewState}
        handleLeaveRoom={handleLeaveRoom}
        handleSetReady={handleSetReady}
        handleSetColor={handleSetColor}
        handleUpdateRoomSettings={handleUpdateRoomSettings}
        handleKickPlayer={handleKickPlayer}
        handleUpdatePlayerRole={handleUpdatePlayerRole}
        handleSetParticipantRole={handleSetParticipantRole}
        handleTransferHost={handleTransferHost}
      />
    );
  }

  const localPlayerId = currentRoom?.players.find(player => player.id === socket.id)?.playerId ?? null;

  return (
    <GameView
      currentRoom={currentRoom}
      gameState={gameState}
      localPlayerId={localPlayerId}
      onAction={handleAction}
      onPreviewAttack={handlePreviewAttack}
      onRegenerate={handleRegenerate}
      onLeaveRoom={handleLeaveRoom}
    />
  );
}

export default App
