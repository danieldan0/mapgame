"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateMap = generateMap;
const d3_delaunay_1 = require("d3-delaunay");
const constants_1 = require("../constants");
function generateMap() {
    const points = new Float64Array(constants_1.NUM_POINTS * 2);
    for (let i = 0; i < constants_1.NUM_POINTS; i++) {
        points[i * 2] = Math.random() * constants_1.MAP_WIDTH;
        points[i * 2 + 1] = Math.random() * constants_1.MAP_HEIGHT;
    }
    let delaunay = new d3_delaunay_1.Delaunay(points);
    let voronoi = delaunay.voronoi([0, 0, constants_1.MAP_WIDTH, constants_1.MAP_HEIGHT]);
    // Lloyd's relaxation
    for (let iter = 0; iter < 2; iter++) {
        for (let i = 0; i < constants_1.NUM_POINTS; i++) {
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
        voronoi = delaunay.voronoi([0, 0, constants_1.MAP_WIDTH, constants_1.MAP_HEIGHT]);
    }
    const tiles = {};
    // 1. Build initial tiles and adjacency graph
    for (let i = 0; i < constants_1.NUM_POINTS; i++) {
        const polygon = voronoi.cellPolygon(i);
        if (!polygon)
            continue;
        const flatPoints = [];
        for (const [x, y] of polygon) {
            flatPoints.push(x, y);
        }
        tiles[i] = {
            id: i,
            points: flatPoints,
            neighbors: Array.from(voronoi.neighbors(i)),
            typeId: Math.random() > 0.7 ? 'sea' : 'land', // Simple random distribution
            ownerId: null,
        };
    }
    // 2. Place cities (spread apart)
    let citiesPlaced = 0;
    const maxCities = 15;
    const tileIds = Object.keys(tiles).map(Number).sort(() => Math.random() - 0.5); // Shuffle
    for (const id of tileIds) {
        if (citiesPlaced >= maxCities)
            break;
        const tile = tiles[id];
        // Check if neighbors have a city
        let hasCityNeighbor = false;
        for (const nId of tile.neighbors) {
            if (tiles[nId] && tiles[nId].typeId === 'city') {
                hasCityNeighbor = true;
                break;
            }
        }
        if (!hasCityNeighbor && tile.typeId === 'land') {
            tile.typeId = 'city';
            citiesPlaced++;
        }
    }
    // 3. Assign starting locations to players
    const playerIds = [1, 2];
    for (const playerId of playerIds) {
        // Find a random land or city tile that is not owned
        const availableStartTiles = Object.values(tiles).filter(t => t.ownerId === null && t.typeId !== 'sea');
        if (availableStartTiles.length > 0) {
            const startTile = availableStartTiles[Math.floor(Math.random() * availableStartTiles.length)];
            startTile.ownerId = playerId;
        }
    }
    return {
        tiles,
        players: { ...constants_1.DEFAULT_PLAYERS },
        turn: 1,
        tileTypes: { ...constants_1.DEFAULT_TILE_TYPES },
    };
}
