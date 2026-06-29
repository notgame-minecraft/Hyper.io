const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));

const MAP_SIZE = 1400;
const CELL_SIZE = 16; // Grid engine block mapping index layout
let players = {};
let timeRemaining = 120;
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
        
        const insideOwn = p.territory.some(t => t.x === currentGridX && t.y === currentGridY);

        if (!insideOwn) {
            if (p.vx !== 0 || p.vy !== 0) {
                const lastTrail = p.trail[p.trail.length - 1];
                if (!lastTrail || lastTrail.x !== p.x || lastTrail.y !== p.y) {
                    p.trail.push({ x: p.x, y: p.y, gX: currentGridX, gY: currentGridY });
                }
            }
        } else if (p.trail.length > 0) {
            // Paper.io structural fill calculation
            p.trail.forEach(tPoint => {
                if (!p.territory.some(t => t.x === tPoint.gX && t.y === tPoint.gY)) {
                    p.territory.push({ x: tPoint.gX, y: tPoint.gY });
                }
            });
            p.trail = [];
        }
    });

    // Clean Collision detection loop
    Object.keys(players).forEach(idA => {
        const pA = players[idA];
        if (!pA.alive) return;

        Object.keys(players).forEach(idB => {
            const pB = players[idB];
            if (!pB.alive) return;

            pB.trail.forEach((tPoint, index) => {
                if (idA === idB && index > pB.trail.length - 8) return;
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

    timeRemaining -= 0.05;

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
                type: 'gameState',
                players: Object.values(players),
                timeRemaining: Math.max(0, timeRemaining)
            }));
        }
    });
}, 50);

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Active server hosted on port ${PORT}`));