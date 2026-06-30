const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));

const MAP_SIZE = 1400;
const CELL_SIZE = 16; 
const TOTAL_CELLS = Math.pow(Math.floor(MAP_SIZE / CELL_SIZE), 2);
let players = {};

const COLOR_POOL = ['#FF5722', '#E91E63', '#9C27B0', '#673AB7', '#3F51B5', '#00BCD4', '#4CAF50', '#FF9800', '#FFC107', '#009688'];

function generateInitialTerritory(pX, pY) {
    let blocks = [];
    const baseGridX = Math.floor(pX / CELL_SIZE);
    const baseGridY = Math.floor(pY / CELL_SIZE);
    const radius = 4;
    for (let x = -radius; x <= radius; x++) {
        for (let y = -radius; y <= radius; y++) {
            if (Math.hypot(x, y) <= radius) blocks.push({ x: baseGridX + x, y: baseGridY + y });
        }
    }
    return blocks;
}

function fillCapturedTerritory(territory, trail) {
    let cellMap = new Map();
    territory.forEach(c => cellMap.set(`${c.x},${c.y}`, { x: c.x, y: c.y }));
    trail.forEach(t => cellMap.set(`${t.gX},${t.gY}`, { x: t.gX, y: t.gY }));
    let trailX = trail.map(t => t.gX); let trailY = trail.map(t => t.gY);
    let minX = Math.min(...trailX) - 1; let maxX = Math.max(...trailX) + 1;
    let minY = Math.min(...trailY) - 1; let maxY = Math.max(...trailY) + 1;

    for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
            if (!cellMap.has(`${x},${y}`)) {
                let intersections = 0;
                for (let i = x; i <= maxX; i++) {
                    if (cellMap.has(`${i},${y}`)) { intersections++; break; }
                }
                if (intersections > 0) cellMap.set(`${x},${y}`, { x, y });
            }
        }
    }
    return Array.from(cellMap.values());
}

wss.on('connection', (ws) => {
    const playerId = Math.random().toString(36).substr(2, 9);
    
    // Auto-spawn without login requirement
    const sX = Math.floor(Math.random() * (MAP_SIZE - 300)) + 150;
    const sY = Math.floor(Math.random() * (MAP_SIZE - 300)) + 150;
    players[playerId] = {
        id: playerId, name: 'Player', x: sX, y: sY, vx: 0, vy: 0,
        color: COLOR_POOL[Math.floor(Math.random() * COLOR_POOL.length)],
        trail: [], territory: generateInitialTerritory(sX, sY), alive: true, score: 0
    };

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            const player = players[playerId];
            if (data.type === 'move' && player && player.alive) {
                player.vx = data.vx || 0; player.vy = data.vy || 0;
            }
        } catch (e) { console.error(e); }
    });

    ws.on('close', () => { delete players[playerId]; });
});

setInterval(() => {
    Object.keys(players).forEach(id => {
        const p = players[id];
        if (!p.alive) return;
        p.x += p.vx * 5.5; p.y += p.vy * 5.5;
        // Collision and territory logic omitted for brevity, keeping base functional
    });
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'gameState', players: Object.values(players) }));
        }
    });
}, 50);

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Active core running on port ${PORT}`));