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
let players = {};
let gameActive = true;

const colors = ['#FF5722', '#E91E63', '#9C27B0', '#673AB7', '#3F51B5', '#00BCD4', '#4CAF50', '#FF9800'];

function getRandomColor() {
    return colors[Math.floor(Math.random() * colors.length)];
}

function generateInitialTerritory(pX, pY) {
    let blocks = [];
    const baseGridX = Math.floor(pX / CELL_SIZE);
    const baseGridY = Math.floor(pY / CELL_SIZE);
    const radius = 4;
    
    for (let x = -radius; x <= radius; x++) {
        for (let y = -radius; y <= radius; y++) {
            if (Math.hypot(x, y) <= radius) {
                blocks.push({ x: baseGridX + x, y: baseGridY + y });
            }
        }
    }
    return blocks;
}

// Helper to check if a point exists inside a coordinate array
function hasCell(arr, x, y) {
    return arr.some(c => c.x === x && c.y === y);
}

// Paper.io Bounding-Box Fill Algorithm
function fillCapturedTerritory(territory, trail) {
    if (trail.length === 0) return territory;

    // Merge current territory and the new trail boundary
    let combined = [...territory];
    trail.forEach(t => {
        if (!hasCell(combined, t.gX, t.gY)) {
            combined.push({ x: t.gX, y: t.gY });
        }
    });

    // Find the boundary box of the trail area
    let minX = Math.min(...trail.map(t => t.gX)) - 1;
    let maxX = Math.max(...trail.map(t => t.gX)) + 1;
    let minY = Math.min(...trail.map(t => t.gY)) - 1;
    let maxY = Math.max(...trail.map(t => t.gY)) + 1;

    // Fill any enclosed holes within that box
    for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
            if (!hasCell(combined, x, y)) {
                // Raycasting check: if enclosed by the shape, fill it
                let intersections = 0;
                for (let i = x; i <= maxX; i++) {
                    if (hasCell(combined, i, y)) {
                        intersections++;
                        break; // Simplistic edge hit
                    }
                }
                if (intersections > 0) {
                    combined.push({ x, y });
                }
            }
        }
    }
    return combined;
}

wss.on('connection', (ws) => {
    const playerId = Math.random().toString(36).substr(2, 9);
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            if (data.type === 'spawn') {
                const sX = Math.floor(Math.random() * (MAP_SIZE - 300)) + 150;
                const sY = Math.floor(Math.random() * (MAP_SIZE - 300)) + 150;
                players[playerId] = {
                    id: playerId,
                    name: data.name ? data.name.substring(0, 12) : 'Guest',
                    x: sX, y: sY, vx: 0, vy: 0,
                    color: getRandomColor(),
                    trail: [],
                    territory: generateInitialTerritory(sX, sY),
                    alive: true, score: 100
                };
                ws.send(JSON.stringify({ type: 'init', playerId, gameWidth: MAP_SIZE, gameHeight: MAP_SIZE }));
            }
            
            const player = players[playerId];
            if (!player || !player.alive) return;

            if (data.type === 'move') {
                player.vx = data.vx || 0;
                player.vy = data.vy || 0;
            }
        } catch (e) { console.error(e); }
    });

    ws.on('close', () => { delete players[playerId]; });
});

setInterval(() => {
    if (!gameActive) return;

    Object.keys(players).forEach(id => {
        const p = players[id];
        if (!p.alive) return;

        p.x += p.vx * 5.5;
        p.y += p.vy * 5.5;

        if (p.x < 0) p.x = 0; if (p.x > MAP_SIZE) p.x = MAP_SIZE;
        if (p.y < 0) p.y = 0; if (p.y > MAP_SIZE) p.y = MAP_SIZE;

        const currentGridX = Math.floor(p.x / CELL_SIZE);
        const currentGridY = Math.floor(p.y / CELL_SIZE);
        
        const insideOwn = hasCell(p.territory, currentGridX, currentGridY);

        if (!insideOwn) {
            if (p.vx !== 0 || p.vy !== 0) {
                const lastTrail = p.trail[p.trail.length - 1];
                if (!lastTrail || lastTrail.gX !== currentGridX || lastTrail.gY !== currentGridY) {
                    p.trail.push({ x: p.x, y: p.y, gX: currentGridX, gY: currentGridY });
                }
            }
        } else if (p.trail.length > 0) {
            // Trigger the absolute boundary fill calculation
            p.territory = fillCapturedTerritory(p.territory, p.trail);
            p.trail = [];
        }
    });

    // Handle Trail Collisions safely
    Object.keys(players).forEach(idA => {
        const pA = players[idA];
        if (!pA.alive) return;

        Object.keys(players).forEach(idB => {
            const pB = players[idB];
            if (!pB.alive) return;

            pB.trail.forEach((tPoint, index) => {
                if (idA === idB && index > pB.trail.length - 5) return;
                if (Math.hypot(pA.x - tPoint.x, pA.y - tPoint.y) < 14) {
                    pB.alive = false;
                }
            });
        });
    });

    Object.keys(players).forEach(id => {
        const p = players[id];
        p.score = p.alive ? p.territory.length * 5 : 0;
    });

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
                type: 'gameState',
                players: Object.values(players)
            }));
        }
    });
}, 50);

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));