const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));

// Game variables
const MAP_SIZE = 1000;
const GRID_SIZE = 10;
let players = {};
let timeRemaining = 90;
let gameActive = true;
let winner = null;

// Colors generator
const colors = ['#FF5722', '#E91E63', '#9C27B0', '#673AB7', '#3F51B5', '#00BCD4', '#009688', '#4CAF50', '#FFEB3B', '#FF9800'];

function getRandomColor() {
    return colors[Math.floor(Math.random() * colors.length)];
}

// Reset Game state
function resetGame() {
    timeRemaining = 90;
    gameActive = true;
    winner = null;
    Object.keys(players).forEach(id => {
        const p = players[id];
        p.x = Math.floor(Math.random() * (MAP_SIZE - 40)) + 20;
        p.y = Math.floor(Math.random() * (MAP_SIZE - 40)) + 20;
        p.trail = [];
        p.alive = true;
        p.score = 0;
        p.territory = [];
        // Give starting plot
        const startGX = Math.floor(p.x / GRID_SIZE);
        const startGY = Math.floor(p.y / GRID_SIZE);
        for(let dx = -2; dx <= 2; dx++) {
            for(let dy = -2; dy <= 2; dy++) {
                p.territory.push(`${startGX + dx},${startGY + dy}`);
            }
        }
    });
}

wss.on('connection', (ws) => {
    const playerId = Math.random().toString(36).substr(2, 9);
    
    // Setup starting player values
    const startX = Math.floor(Math.random() * (MAP_SIZE - 40)) + 20;
    const startY = Math.floor(Math.random() * (MAP_SIZE - 40)) + 20;
    const startGX = Math.floor(startX / GRID_SIZE);
    const startGY = Math.floor(startY / GRID_SIZE);
    
    let initialTerritory = [];
    for(let dx = -2; dx <= 2; dx++) {
        for(let dy = -2; dy <= 2; dy++) {
            initialTerritory.push(`${startGX + dx},${startGY + dy}`);
        }
    }

    players[playerId] = {
        id: playerId,
        name: 'Guest',
        x: startX,
        y: startY,
        vx: 0,
        vy: 0,
        color: getRandomColor(),
        trail: [],
        territory: initialTerritory,
        alive: true,
        score: initialTerritory.length
    };

    ws.send(JSON.stringify({
        type: 'init',
        playerId: playerId,
        gameWidth: MAP_SIZE,
        gameHeight: MAP_SIZE
    }));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            const player = players[playerId];
            if (!player || !player.alive) return;

            if (data.type === 'setName') {
                player.name = data.name.substring(0, 14);
            } else if (data.type === 'move') {
                player.vx = data.vx || 0;
                player.vy = data.vy || 0;
            }
        } catch (e) { console.error(e); }
    });

    ws.on('close', () => {
        delete players[playerId];
    });
});

// Main physics and rules engine loop
setInterval(() => {
    if (!gameActive) return;

    // 1. Move players & handle trails
    Object.keys(players).forEach(id => {
        const p = players[id];
        if (!p.alive) return;

        p.x += p.vx * 4; // Speed factor
        p.y += p.vy * 4;

        // Boundaries check
        if (p.x < 0) p.x = 0; if (p.x > MAP_SIZE) p.x = MAP_SIZE;
        if (p.y < 0) p.y = 0; if (p.y > MAP_SIZE) p.y = MAP_SIZE;

        const currentGridKey = `${Math.floor(p.x / GRID_SIZE)},${Math.floor(p.y / GRID_SIZE)}`;
        const insideOwnTerritory = p.territory.includes(currentGridKey);

        if (!insideOwnTerritory) {
            // Push trail coordinate points if moving
            if (p.vx !== 0 || p.vy !== 0) {
                p.trail.push({ x: p.x, y: p.y });
            }
        } else if (p.trail.length > 0) {
            // When returning to own plot, fill the trail into territory
            p.trail.forEach(pt => {
                const gk = `${Math.floor(pt.x / GRID_SIZE)},${Math.floor(pt.y / GRID_SIZE)}`;
                if (!p.territory.includes(gk)) p.territory.push(gk);
            });
            p.trail = [];
        }
    });

    // 2. Trail Ramming / Hit Elimination Logic
    Object.keys(players).forEach(idA => {
        const pA = players[idA];
        if (!pA.alive) return;

        Object.keys(players).forEach(idB => {
            const pB = players[idB];
            if (!pB.alive) return;

            // Check if player A rams into Player B's trail
            pB.trail.forEach(trailPoint => {
                const dist = Math.hypot(pA.x - trailPoint.x, pA.y - trailPoint.y);
                if (dist < 12) { 
                    // KILL THE TRAIL OWNER (Player B dies, NOT the rammer Player A)
                    pB.alive = false;
                    pB.trail = [];
                }
            });
        });
    });

    // Update scores based on total territory units
    Object.keys(players).forEach(id => {
        const p = players[id];
        p.score = p.alive ? p.territory.length : 0;
    });

    // Handle timer ticker
    timeRemaining -= 1 / 20; // Decrement according to loop tick rate
    if (timeRemaining <= 0) {
        gameActive = false;
        let highestScore = -1;
        Object.keys(players).forEach(id => {
            if (players[id].score > highestScore) {
                highestScore = players[id].score;
                winner = players[id];
            }
        });
        setTimeout(resetGame, 5000); // Auto-restart match after 5 seconds
    }

    // Distribute Game State payload to all clients
    const payload = JSON.stringify({
        type: 'gameState',
        players: Object.values(players),
        timeRemaining: Math.max(0, timeRemaining),
        gameActive,
        winner
    });

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) client.send(payload);
    });
}, 50);

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));