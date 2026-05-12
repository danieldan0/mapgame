"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const generateMap_1 = require("./mapgen/generateMap");
const gameEngine_1 = require("./engine/gameEngine");
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server, {
    cors: {
        origin: '*', // Allow connections from Vite frontend
    }
});
let gameState = (0, generateMap_1.generateMap)();
io.on('connection', (socket) => {
    console.log('a user connected');
    socket.emit('gameState', gameState);
    socket.on('regenerateMap', () => {
        gameState = (0, generateMap_1.generateMap)();
        io.emit('gameState', gameState);
    });
    socket.on('action', (action) => {
        // For singleplayer prototype, assume player 1 is acting
        const actingPlayerId = 1;
        const stateChanged = (0, gameEngine_1.handleAction)(gameState, action, actingPlayerId);
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
