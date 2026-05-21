import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import { GameView } from './components/GameView.tsx'
import { Lobby } from './components/Lobby.tsx'
import { Room } from './components/Room.tsx'
import { useAuth } from './hooks/useAuth.ts'
import type { GameAction, GameState, RoomInfo } from '../../shared/src/types.ts'
import './App.css'

const socketUrl = import.meta.env.VITE_SOCKET_URL ?? `${window.location.protocol}//${window.location.hostname}:3000`;
const socket = io(socketUrl);

type ViewState = 'LOBBY' | 'ROOM' | 'GAME';

function App() {
  const [viewState, setViewState] = useState<ViewState>('LOBBY');
  const [roomsList, setRoomsList] = useState<RoomInfo[]>([]);
  const [currentRoom, setCurrentRoom] = useState<RoomInfo | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [reconnectInfo, setReconnectInfo] = useState<{ roomId: string; roomName: string } | null>(null);

  const { accountUsername, authError, login, register, logout, dismissAuthError } = useAuth(socket);

  useEffect(() => {
    const doAuthenticate = () => {
      const token = localStorage.getItem('mapgame_token') ?? undefined;
      socket.emit('authenticate', token);
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
    });

    socket.on('gameStarted', () => {
      setViewState('GAME');
    });

    socket.on('gameState', (newGameState: GameState) => {
      setGameState(newGameState);
    });

    socket.on('error', (msg: string) => {
      alert(`Error: ${msg}`);
    });

    socket.on('kicked', (msg: string) => {
      alert(`Disconnected: ${msg}`);
      window.location.reload();
    });

    return () => {
      socket.off('connect', doAuthenticate);
      socket.off('reconnectAvailable');
      socket.off('roomsList');
      socket.off('roomUpdate');
      socket.off('gameStarted');
      socket.off('gameState');
      socket.off('error');
      socket.off('kicked');
    };
  }, []);

  const handleReconnect = () => {
    if (!reconnectInfo) return;
    const roomId = reconnectInfo.roomId;
    setReconnectInfo(null);
    socket.emit('joinRoom', roomId);
  };

  const handleCreateRoom = (playerName: string) => {
    setReconnectInfo(null);
    const roomOwnerName = playerName.trim() || 'Player';
    socket.emit('setName', roomOwnerName);
    socket.emit('createRoom', `${roomOwnerName}'s Room`);
    setViewState('ROOM');
  };

  const handleJoinRoom = (roomId: string, playerName: string) => {
    setReconnectInfo(null);
    const trimmedName = playerName.trim();
    if (trimmedName) {
      socket.emit('setName', trimmedName);
    }
    socket.emit('joinRoom', roomId);
    setViewState('ROOM');
  };

  const handleLeaveRoom = () => {
    socket.emit('leaveRoom');
    setCurrentRoom(null);
    setGameState(null);
    setViewState('LOBBY');
  };

  const handleSetReady = (isReady: boolean) => {
    socket.emit('setReady', isReady);
  };

  const handleSetColor = (color: number) => {
    socket.emit('setColor', color);
  };

  const handleAction = (action: GameAction) => {
    socket.emit('action', action);
  };

  const handlePreviewAttack = (defenderId: number) => {
    socket.emit('previewAttack', defenderId);
  };

  const handleRegenerate = () => {
    socket.emit('regenerateMap');
  };

  if (viewState === 'LOBBY') {
    return (
      <Lobby
        roomsList={roomsList}
        onCreateRoom={handleCreateRoom}
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

  if (viewState === 'ROOM' && currentRoom) {
    return (
      <Room
        currentRoom={currentRoom}
        socketId={socket.id}
        handleLeaveRoom={handleLeaveRoom}
        handleSetReady={handleSetReady}
        handleSetColor={handleSetColor}
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
