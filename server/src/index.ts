import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import type { CreateRoomRequest, GameAction, InviteRoomInfo, JoinRoomRequest, RoomInfo, UpdateRoomSettingsRequest } from '@mapgame/shared';
import { GameRoom } from './engine/GameRoom';
import { v4 as uuidv4 } from 'uuid';
import { runMigrations } from './db';
import { RoomRepository } from './repositories/RoomRepository';
import { SnapshotRepository } from './repositories/SnapshotRepository';
import { attachAuthHandlers, type ConnectionState } from './handlers/authHandlers';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

const rooms = new Map<string, GameRoom>();

// Maps socket ID -> persistent player data for DB-backed operations
const socketToPlayer = new Map<string, { playerId: string; token: string; name: string }>();

function getRoomsList(): RoomInfo[] {
  return Array.from(rooms.values())
    .filter(r => !r.isPrivate)
    .map(r => r.getRoomInfo());
}

function broadcastRoomsList() {
  io.emit('roomsList', getRoomsList());
}

function normalizeCreateRoomRequest(request: string | CreateRoomRequest, playerName: string): CreateRoomRequest {
  if (typeof request === 'string') {
    return {
      name: request || `${playerName}'s Room`,
      isPrivate: false,
    maxPlayers: 6,
    };
  }

  return {
    name: request.name?.trim() || `${playerName}'s Room`,
    isPrivate: Boolean(request.isPrivate),
    password: request.password?.trim() || undefined,
    maxPlayers: clampMaxPlayers(request.maxPlayers),
  };
}

function clampMaxPlayers(maxPlayers?: number): number {
  return Math.max(2, Math.min(99, Number(maxPlayers) || 6));
}

function normalizeJoinRoomRequest(request: string | JoinRoomRequest): JoinRoomRequest {
  if (typeof request === 'string') {
    return { roomId: request };
  }

  return {
    roomId: request.roomId,
    password: request.password,
  };
}

function attachPersistenceCallbacks(room: GameRoom) {
  room.onGameStart = () => {
    RoomRepository.updateStatus(room.id, 'playing').catch(console.error);
  };
  room.onTurnEnd = (state) => {
    SnapshotRepository.save(room.id, state.turn, state).catch(console.error);
  };
}

async function loadActiveRooms() {
  const activeRooms = await RoomRepository.getActiveRooms();
  for (const roomRecord of activeRooms) {
    if (roomRecord.status === 'playing') {
      const snapshot = await SnapshotRepository.getLatest(roomRecord.id);
      if (snapshot) {
        const room = GameRoom.fromSnapshot(roomRecord.id, roomRecord.name, snapshot.state);
        attachPersistenceCallbacks(room);
        const dbPlayers = await RoomRepository.getPlayersInRoom(roomRecord.id);
        for (const p of dbPlayers) {
          room.markPlayerDisconnected(p.persistentId, {
            id: p.persistentId,
            playerId: p.gamePlayerId,
            name: p.displayName,
            color: p.color,
            isReady: true,
          });
        }
        rooms.set(roomRecord.id, room);
        console.log(`Loaded room "${roomRecord.name}" from snapshot at turn ${snapshot.turnNumber} with ${dbPlayers.length} disconnected player(s)`);
      }
    } else {
      const room = new GameRoom(roomRecord.id, roomRecord.name);
      attachPersistenceCallbacks(room);
      rooms.set(roomRecord.id, room);
      console.log(`Loaded waiting room "${roomRecord.name}"`);
    }
  }
}

io.on('connection', (socket) => {
  console.log(`user connected: ${socket.id}`);

  const conn: ConnectionState = {
    playerName: `Player_${socket.id.substring(0, 4)}`,
    authPromise: null,
  };
  let currentRoomId: string | null = null;

  socket.emit('roomsList', getRoomsList());

  attachAuthHandlers(socket, conn, socketToPlayer, rooms);

  socket.on('createRoom', async (request: string | CreateRoomRequest) => {
    if (currentRoomId) return;
    if (conn.authPromise) await conn.authPromise;

    const roomId = uuidv4();
    const settings = normalizeCreateRoomRequest(request, conn.playerName);
    const room = new GameRoom(roomId, settings.name, undefined, settings);
    rooms.set(roomId, room);
    attachPersistenceCallbacks(room);

    const playerData = socketToPlayer.get(socket.id);
    room.addPlayer(socket.id, conn.playerName, playerData?.playerId);
    currentRoomId = roomId;
    socket.join(roomId);

    RoomRepository.create(roomId, settings.name)
      .then(() => {
        const playerInfo = room.getPlayerInfo(socket.id);
        if (playerData && playerInfo) {
          RoomRepository.addPlayer(roomId, playerData.playerId, playerInfo.playerId, playerInfo.color).catch(console.error);
        }
      })
      .catch(console.error);

    io.to(roomId).emit('roomUpdate', room.getRoomInfo());
    broadcastRoomsList();
  });

  socket.on('getInviteRoomInfo', (roomId: string) => {
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit('inviteRoomError', 'Room not found');
      return;
    }

    const info: InviteRoomInfo = {
      roomId: room.id,
      roomName: room.name,
      status: room.status,
      hasPassword: room.getRoomInfo().hasPassword,
    };
    socket.emit('inviteRoomInfo', info);
  });

  socket.on('joinRoom', async (request: string | JoinRoomRequest) => {
    if (currentRoomId) return;
    if (conn.authPromise) await conn.authPromise;

    const joinRequest = normalizeJoinRoomRequest(request);
    const roomId = joinRequest.roomId;
    const room = rooms.get(roomId);
    const playerData = socketToPlayer.get(socket.id);

    const isAlreadyInRoom =
      playerData !== undefined &&
      room?.hasActivePlayer(playerData.playerId) === true;

    const isReconnecting =
      room?.status === 'playing' &&
      playerData !== undefined &&
      room.hasDisconnectedPlayer(playerData.playerId);

    const isReturningPlayer = isAlreadyInRoom || isReconnecting;

    if (room && room.status === 'waiting' && !isReturningPlayer) {
      if (!room.hasOpenSeat()) {
        socket.emit('error', 'Room is full');
        return;
      }

      if (!room.canJoin(joinRequest.password)) {
        socket.emit('error', 'Incorrect room password');
        return;
      }
    }

    if (room && (room.status === 'waiting' || isReconnecting || isAlreadyInRoom)) {
      const oldSocketId = room.addPlayer(socket.id, conn.playerName, playerData?.playerId);
      if (oldSocketId) {
        const oldSocket = io.sockets.sockets.get(oldSocketId);
        if (oldSocket) {
          oldSocket.leave(roomId);
          oldSocket.emit('kicked', 'You connected from another device.');
        }
      }
      
      currentRoomId = roomId;
      socket.join(roomId);

      if (playerData) {
        const playerInfo = room.getPlayerInfo(socket.id);
        if (playerInfo) {
          RoomRepository.addPlayer(roomId, playerData.playerId, playerInfo.playerId, playerInfo.color).catch(console.error);
        }
      }

      io.to(roomId).emit('roomUpdate', room.getRoomInfo());
      broadcastRoomsList();

      if (room.status === 'playing') {
        socket.emit('gameStarted');
        socket.emit('gameState', room.getState());
      }
    } else {
      socket.emit('error', 'Room not found or already playing');
    }
  });

  socket.on('leaveRoom', () => {
    if (!currentRoomId) return;

    const room = rooms.get(currentRoomId);
    if (room) {
      const playerData = socketToPlayer.get(socket.id);
      room.removePlayer(socket.id, true); // force-remove: voluntary leave
      socket.leave(currentRoomId);

      if (playerData) {
        RoomRepository.removePlayer(currentRoomId, playerData.playerId).catch(console.error);
      }

      if (room.isEmpty() && !room.hasDisconnectedPlayers()) {
        rooms.delete(currentRoomId);
        RoomRepository.delete(currentRoomId).catch(console.error);
      } else {
        io.to(currentRoomId).emit('roomUpdate', room.getRoomInfo());
      }
      broadcastRoomsList();
    }
    currentRoomId = null;
  });

  socket.on('setReady', (isReady: boolean) => {
    if (!currentRoomId) return;

    const room = rooms.get(currentRoomId);
    if (room && room.status === 'waiting') {
      room.setPlayerReady(socket.id, isReady);
      io.to(currentRoomId).emit('roomUpdate', room.getRoomInfo());

      if (room.areAllPlayersReady()) {
        room.startGame();
        io.to(currentRoomId).emit('roomUpdate', room.getRoomInfo());
        io.to(currentRoomId).emit('gameStarted');
        io.to(currentRoomId).emit('gameState', room.getState());
        broadcastRoomsList();
      }
    }
  });

  socket.on('setColor', (color: number) => {
    if (!currentRoomId) return;

    const room = rooms.get(currentRoomId);
    if (room && room.status === 'waiting') {
      const colorChanged = room.setPlayerColor(socket.id, color);
      if (colorChanged) {
        io.to(currentRoomId).emit('roomUpdate', room.getRoomInfo());
        broadcastRoomsList();
      } else {
        socket.emit('error', 'Color is unavailable');
      }
    }
  });

  socket.on('updateRoomSettings', (settings: UpdateRoomSettingsRequest) => {
    if (!currentRoomId) return;

    const room = rooms.get(currentRoomId);
    if (!room || room.status !== 'waiting') return;

    if (!room.isHost(socket.id)) {
      socket.emit('error', 'Only the host can edit room settings');
      return;
    }

    room.updateSettings(settings);
    io.to(currentRoomId).emit('roomUpdate', room.getRoomInfo());
    broadcastRoomsList();
  });

  socket.on('regenerateMap', () => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (room && room.status === 'playing') {
      room.regenerateMap();
      io.to(currentRoomId).emit('gameState', room.getState());
    }
  });

  socket.on('previewAttack', (defenderId: number) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (room && room.status === 'playing') {
      const actingPlayerId = room.getPlayerGameId(socket.id);
      if (actingPlayerId === null) return;
      const stateChanged = room.previewAttack(actingPlayerId, defenderId);
      if (stateChanged) {
        io.to(currentRoomId).emit('gameState', room.getState());
      }
    }
  });

  socket.on('action', (action: GameAction) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (room && room.status === 'playing') {
      const actingPlayerId = room.getPlayerGameId(socket.id);
      if (actingPlayerId === null) return;
      const stateChanged = room.handleAction(action, actingPlayerId);
      if (stateChanged) {
        io.to(currentRoomId).emit('gameState', room.getState());
      }
    }
  });

  socket.on('disconnect', () => {
    console.log(`user disconnected: ${socket.id}`);
    if (currentRoomId) {
      const room = rooms.get(currentRoomId);
      if (room) {
        room.removePlayer(socket.id); // non-force: keeps in disconnectedPlayers during a game
        if (room.isEmpty() && !room.hasDisconnectedPlayers()) {
          rooms.delete(currentRoomId);
          RoomRepository.delete(currentRoomId).catch(console.error);
        } else {
          io.to(currentRoomId).emit('roomUpdate', room.getRoomInfo());
        }
        broadcastRoomsList();
      }
    }
    socketToPlayer.delete(socket.id);
  });
});

async function main() {
  await runMigrations();
  await loadActiveRooms();
  server.listen(3000, () => {
    console.log('listening on *:3000');
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
