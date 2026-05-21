import type { Socket } from 'socket.io';
import bcrypt from 'bcryptjs';
import { PlayerRepository } from '../repositories/PlayerRepository';
import { RoomRepository } from '../repositories/RoomRepository';
import type { GameRoom } from '../engine/GameRoom';

export interface ConnectionState {
  playerName: string;
  authPromise: Promise<void> | null;
}

type SocketPlayerMap = Map<string, { playerId: string; token: string; name: string }>;

export function attachAuthHandlers(
  socket: Socket,
  conn: ConnectionState,
  socketToPlayer: SocketPlayerMap,
  rooms: Map<string, GameRoom>,
): void {
  socket.on('authenticate', (token?: string) => {
    conn.authPromise = (async () => {
      let player = token ? await PlayerRepository.findByToken(token) : null;
      if (!player) {
        player = await PlayerRepository.create(conn.playerName);
      } else {
        PlayerRepository.updateLastSeen(player.id).catch(console.error);
        conn.playerName = player.displayName;
      }

      socketToPlayer.set(socket.id, {
        playerId: player.id,
        token: player.token,
        name: player.displayName,
      });

      socket.emit('authenticated', {
        token: player.token,
        name: player.displayName,
        username: player.username ?? undefined,
      });

      // Check DB first for a reconnectable room
      const activeRoom = await RoomRepository.findActiveRoomForPlayer(player.id);
      let reconnectRoom: { id: string; name: string } | null = null;

      if (activeRoom?.status === 'playing') {
        const room = rooms.get(activeRoom.id);
        if (room?.hasDisconnectedPlayer(player.id) || room?.hasActivePlayer(player.id)) {
          reconnectRoom = { id: activeRoom.id, name: activeRoom.name };
        }
      }

      // In-memory fallback: DB write may have been missed
      if (!reconnectRoom) {
        for (const [roomId, room] of rooms) {
          if (room.status === 'playing' && (room.hasDisconnectedPlayer(player.id) || room.hasActivePlayer(player.id))) {
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

  socket.on('setName', (name: string) => {
    conn.playerName = name;
    const playerData = socketToPlayer.get(socket.id);
    if (playerData) {
      playerData.name = name;
      PlayerRepository.updateName(playerData.playerId, name).catch(console.error);
    }
  });

  socket.on('register', async ({ username, password }: { username: string; password: string }) => {
    if (conn.authPromise) await conn.authPromise;
    const playerData = socketToPlayer.get(socket.id);
    if (!playerData) { socket.emit('authError', 'Not authenticated'); return; }

    const trimmed = username.trim().toLowerCase();
    if (trimmed.length < 3 || trimmed.length > 20) {
      socket.emit('authError', 'Username must be 3–20 characters');
      return;
    }
    if (!/^[a-z0-9_]+$/.test(trimmed)) {
      socket.emit('authError', 'Username may only contain letters, numbers, and underscores');
      return;
    }
    if (password.length < 6) {
      socket.emit('authError', 'Password must be at least 6 characters');
      return;
    }

    const existing = await PlayerRepository.findByUsername(trimmed);
    if (existing) { socket.emit('authError', 'Username already taken'); return; }

    const hash = await bcrypt.hash(password, 10);
    await PlayerRepository.setCredentials(playerData.playerId, trimmed, hash);
    socket.emit('registerSuccess', { username: trimmed });
  });

  socket.on('login', async ({ username, password }: { username: string; password: string }) => {
    const trimmed = username.trim().toLowerCase();
    const player = await PlayerRepository.findByUsername(trimmed);
    if (!player || !player.passwordHash || !await bcrypt.compare(password, player.passwordHash)) {
      socket.emit('authError', 'Invalid username or password');
      return;
    }

    PlayerRepository.updateLastSeen(player.id).catch(console.error);
    conn.playerName = player.displayName;
    socketToPlayer.set(socket.id, { playerId: player.id, token: player.token, name: player.displayName });

    socket.emit('authenticated', { token: player.token, name: player.displayName, username: player.username ?? undefined });

    const activeRoom = await RoomRepository.findActiveRoomForPlayer(player.id);
    if (activeRoom?.status === 'playing') {
      const room = rooms.get(activeRoom.id);
      if (room?.hasDisconnectedPlayer(player.id) || room?.hasActivePlayer(player.id)) {
        socket.emit('reconnectAvailable', { roomId: activeRoom.id, roomName: activeRoom.name });
      }
    }
  });
}
