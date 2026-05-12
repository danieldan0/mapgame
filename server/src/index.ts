import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import type { GameAction, RoomInfo } from '@mapgame/shared';
import { GameRoom } from './engine/GameRoom';
import { v4 as uuidv4 } from 'uuid';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // Allow connections from Vite frontend
  }
});

const rooms = new Map<string, GameRoom>();

function getRoomsList(): RoomInfo[] {
  return Array.from(rooms.values()).map(r => r.getRoomInfo());
}

function broadcastRoomsList() {
  io.emit('roomsList', getRoomsList());
}

io.on('connection', (socket) => {
  console.log(`a user connected: ${socket.id}`);
  
  let currentRoomId: string | null = null;
  let playerName = `Player_${socket.id.substring(0, 4)}`; // Default name

  // Send initial lobby data
  socket.emit('roomsList', getRoomsList());

  socket.on('setName', (name: string) => {
    playerName = name;
  });

  socket.on('createRoom', (roomName: string) => {
    if (currentRoomId) return; // Already in a room

    const roomId = uuidv4();
    const room = new GameRoom(roomId, roomName || `${playerName}'s Room`);
    rooms.set(roomId, room);
    
    // Auto-join the created room
    room.addPlayer(socket.id, playerName);
    currentRoomId = roomId;
    socket.join(roomId);
    
    io.to(roomId).emit('roomUpdate', room.getRoomInfo());
    broadcastRoomsList();
  });

  socket.on('joinRoom', (roomId: string) => {
    if (currentRoomId) return; // Already in a room
    
    const room = rooms.get(roomId);
    if (room && room.status === 'waiting') {
      room.addPlayer(socket.id, playerName);
      currentRoomId = roomId;
      socket.join(roomId);
      
      io.to(roomId).emit('roomUpdate', room.getRoomInfo());
      broadcastRoomsList();
    } else {
      socket.emit('error', 'Room not found or already playing');
    }
  });

  socket.on('leaveRoom', () => {
    if (!currentRoomId) return;
    
    const room = rooms.get(currentRoomId);
    if (room) {
      room.removePlayer(socket.id);
      socket.leave(currentRoomId);
      
      if (room.isEmpty()) {
        rooms.delete(currentRoomId);
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
        broadcastRoomsList(); // Update status in lobby
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

  // Game actions
  socket.on('regenerateMap', () => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (room && room.status === 'playing') {
      room.regenerateMap();
      io.to(currentRoomId).emit('gameState', room.getState());
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
        room.removePlayer(socket.id);
        if (room.isEmpty()) {
          rooms.delete(currentRoomId);
        } else {
          io.to(currentRoomId).emit('roomUpdate', room.getRoomInfo());
        }
        broadcastRoomsList();
      }
    }
  });
}); 

server.listen(3000, () => {
  console.log('listening on *:3000');
});
