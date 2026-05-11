"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const d3_delaunay_1 = require("d3-delaunay");
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server, {
    cors: {
        origin: '*', // Allow connections from Vite frontend
    }
});
const MAP_WIDTH = 2000;
const MAP_HEIGHT = 2000;
const NUM_POINTS = 300;
function generateMap() {
    const points = new Float64Array(NUM_POINTS * 2);
    for (let i = 0; i < NUM_POINTS; i++) {
        points[i * 2] = Math.random() * MAP_WIDTH;
        points[i * 2 + 1] = Math.random() * MAP_HEIGHT;
    }
    let delaunay = new d3_delaunay_1.Delaunay(points);
    let voronoi = delaunay.voronoi([0, 0, MAP_WIDTH, MAP_HEIGHT]);
    // Lloyd's relaxation
    for (let iter = 0; iter < 2; iter++) {
        for (let i = 0; i < NUM_POINTS; i++) {
            const polygon = voronoi.cellPolygon(i);
            if (!polygon)
                continue;
            let cx = 0, cy = 0;
            for (let j = 0; j < polygon.length - 1; j++) {
                cx += polygon[j][0];
                cy += polygon[j][1];
            }
            cx /= (polygon.length - 1);
            cy /= (polygon.length - 1);
            points[i * 2] = cx;
            points[i * 2 + 1] = cy;
        }
        delaunay = new d3_delaunay_1.Delaunay(points);
        voronoi = delaunay.voronoi([0, 0, MAP_WIDTH, MAP_HEIGHT]);
    }
    const polygons = [];
    const colors = [0x228B22, 0xDEB887, 0x4682B4, 0x8F9779];
    for (let i = 0; i < NUM_POINTS; i++) {
        const polygon = voronoi.cellPolygon(i);
        if (!polygon)
            continue;
        const flatPoints = [];
        for (const [x, y] of polygon) {
            flatPoints.push(x, y);
        }
        polygons.push({
            id: `region-${i}`,
            points: flatPoints,
            terrainColor: colors[Math.floor(Math.random() * colors.length)],
        });
    }
    return polygons;
}
let currentMap = generateMap();
io.on('connection', (socket) => {
    console.log('a user connected');
    socket.emit('mapUpdate', currentMap);
    socket.on('regenerateMap', () => {
        currentMap = generateMap();
        io.emit('mapUpdate', currentMap);
    });
    socket.on('disconnect', () => {
        console.log('user disconnected');
    });
});
server.listen(3000, () => {
    console.log('listening on *:3000');
});
