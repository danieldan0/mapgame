"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_PLAYERS = exports.DEFAULT_TILE_TYPES = exports.NUM_POINTS = exports.MAP_HEIGHT = exports.MAP_WIDTH = void 0;
exports.MAP_WIDTH = 2000;
exports.MAP_HEIGHT = 2000;
exports.NUM_POINTS = 300;
exports.DEFAULT_TILE_TYPES = {
    land: { id: 'land', name: 'Land', color: 0x228B22 }, // Forest Green
    sea: { id: 'sea', name: 'Sea', color: 0x4682B4 }, // Steel Blue
    city: { id: 'city', name: 'City', color: 0x808080 }, // Gray
};
exports.DEFAULT_PLAYERS = {
    1: { id: 1, name: 'Player 1', color: 0xFF4500 }, // OrangeRed
    2: { id: 2, name: 'Player 2', color: 0x1E90FF }, // DodgerBlue
};
