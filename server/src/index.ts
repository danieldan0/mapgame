import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import type { GameAction } from '@mapgame/shared';
import { generateMap } from './mapgen/generateMap';
import { handleAction } from './engine/gameEngine';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // Allow connections from Vite frontend
  }
});

let gameState = generateMap();

io.on('connection', (socket) => {
  console.log('a user connected');

  socket.emit('gameState', gameState);

  socket.on('regenerateMap', () => {
    gameState = generateMap();
    io.emit('gameState', gameState);
  });

  socket.on('action', (action: GameAction) => {
    // For singleplayer prototype, assume player 1 is acting
    const actingPlayerId = 1; 
    
    const stateChanged = handleAction(gameState, action, actingPlayerId);
    
    if (stateChanged) {
      io.emit('gameState', gameState);
    }
  });
  
  socket.on('disconnect', () => {
    console.log('user disconnected');
  });
}); 

server.listen(3000, () => {
  console.log('listening on *:3000');
});
