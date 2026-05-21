import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import type { GameAction, RoomInfo } from '@mapgame/shared';
import { GameRoom } from './engine/GameRoom';
import { v4 as uuidv4 } from 'uuid';
import { runMigrations } from './db';
import { PlayerRepository } from './repositories/PlayerRepository';
import { RoomRepository } from './repositories/RoomRepository';
import { SnapshotRepository } from './repositories/SnapshotRepository';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

const rooms = new Map<string, GameRoom>();

// Maps socket ID -> persistent player data for DB-backed operations
const socketToPlayer = new Map<string, { playerId: string; token: string; name: string }>();

function getRoomsList(): RoomInfo[] {
  return Array.from(rooms.values()).map(r => r.getRoomInfo());
}

function broadcastRoomsList() {
  io.emit('roomsList', getRoomsList());
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

  let currentRoomId: string | null = null;
  let playerName = `Player_${socket.id.substring(0, 4)}`;

  // Resolved once authenticate completes. createRoom/joinRoom await this so
  // socketToPlayer is always populated before a room action is processed -
  // even if the DB query in authenticate hasn't finished yet.
  let authPromise: Promise<void> | null = null;

  socket.emit('roomsList', getRoomsList());

  // Persistent identity. Client sends stored token (if any); server returns token to store.
  socket.on('authenticate', (token?: string) => {
    authPromise = (async () => {
      let player = token ? await PlayerRepository.findByToken(token) : null;
      if (!player) {
        player = await PlayerRepository.create(playerName);
      } else {
        PlayerRepository.updateLastSeen(player.id).catch(console.error);
        playerName = player.displayName;
      }

      socketToPlayer.set(socket.id, {
        playerId: player.id,
        token: player.token,
        name: player.displayName,
      });

      socket.emit('authenticated', {
        token: player.token,
        name: player.displayName,
        playerId: player.id,
      });

      // Check DB first for a reconnectable room
      const activeRoom = await RoomRepository.findActiveRoomForPlayer(player.id);
      let reconnectRoom: { id: string; name: string } | null = null;

      if (activeRoom?.status === 'playing') {
        const room = rooms.get(activeRoom.id);
        if (room?.hasDisconnectedPlayer(player.id)) {
          reconnectRoom = { id: activeRoom.id, name: activeRoom.name };
        }
      }

      // In-memory fallback: DB write may have been missed (wrong port, timing, etc.)
      if (!reconnectRoom) {
        for (const [roomId, room] of rooms) {
          if (room.status === 'playing' && room.hasDisconnectedPlayer(player.id)) {
            reconnectRoom = { id: roomId, name: room.name };
            break;
          }
        }
      }

      if (reconnectRoom) {
        socket.emit('reconnectAvailable', { roomId: reconnectRoom.id, roomName: reconnectRoom.name });
      }
    })().catch((err) => {
      console.error('authenticate error:', err);
      socket.emit('error', 'Authentication failed');
    });
  });

  socket.on('setName', async (name: string) => {
    playerName = name;
    const playerData = socketToPlayer.get(socket.id);
    if (playerData) {
      playerData.name = name;
      PlayerRepository.updateName(playerData.playerId, name).catch(console.error);
    }
  });

  socket.on('createRoom', async (roomName: string) => {
    if (currentRoomId) return;
    if (authPromise) await authPromise;

    const roomId = uuidv4();
    const name = roomName || `${playerName}'s Room`;
    const room = new GameRoom(roomId, name);
    rooms.set(roomId, room);
    attachPersistenceCallbacks(room);

    const playerData = socketToPlayer.get(socket.id);
    room.addPlayer(socket.id, playerName, playerData?.playerId);
    currentRoomId = roomId;
    socket.join(roomId);

    RoomRepository.create(roomId, name)
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

  socket.on('joinRoom', async (roomId: string) => {
    if (currentRoomId) return;
    if (authPromise) await authPromise;

    const room = rooms.get(roomId);
    const playerData = socketToPlayer.get(socket.id);

    const isReconnecting =
      room?.status === 'playing' &&
      playerData !== undefined &&
      room.hasDisconnectedPlayer(playerData.playerId);

    if (room && (room.status === 'waiting' || isReconnecting)) {
      room.addPlayer(socket.id, playerName, playerData?.playerId);
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
