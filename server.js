const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));

const MAP_SIZE = 1000;
let players = {};
let timeRemaining = 90;
let gameActive = true;
let winner = null;

const colors = ['#FF5722', '#E91E63', '#9C27B0', '#673AB7', '#3F51B5', '#00BCD4', '#009688', '#4CAF50', '#FFEB3B', '#FF9800'];

function getRandomColor() {
    return colors[Math.floor(Math.random() * colors.length)];
}

// Generate an initial safe circular home territory zone for a new player
function generateInitialTerritory(centerX, centerY) {
    let points = [];
    const radius = 45; // Size of starting base
    // Create a smooth continuous circular polygon
    for (let a = 0; a < Math.PI * 2; a += 0.2) {
        points.push({
            x: centerX + Math.cos(a) * radius,
            y: centerY + Math.sin(a) * radius
        });
    }
    return points;
}

function resetGame() {
    timeRemaining = 90;
    gameActive = true;
    winner = null;
    Object.keys(players).forEach(id => {
        const p = players[id];
        p.x = Math.floor(Math.random() * (MAP_SIZE - 100)) + 50;
        p.y = Math.floor(Math.random() * (MAP_SIZE - 100)) + 50;
        p.trail = [];
        p.alive = true;
        p.score = 100;
        p.territory = generateInitialTerritory(p.x, p.y);
    });
}

// Simple check to see if a coordinate point is inside a polygon boundary
function isPointInPolygon(point, polygon) {
    let x = point.x, y = point.y;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        let xi = polygon[i].x, yi = polygon[i].y;
        let xj = polygon[j].x, yj = polygon[j].y;
        let intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

wss.on('connection', (ws) => {
    const playerId = Math.random().toString(36).substr(2, 9);
    const startX = Math.floor(Math.random() * (MAP_SIZE - 100)) + 50;
    const startY = Math.floor(Math.random() * (MAP_SIZE - 100)) + 50;
    
    players[playerId] = {
        id: playerId,
        name: 'Guest',
        x: startX,
        y: startY,
        vx: 0,
        vy: 0,
        color: getRandomColor(),
        trail: [],
        territory: generateInitialTerritory(startX, startY),
        alive: true,
        score: 100
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

    ws.on('close', () => { delete players[playerId]; });
});

setInterval(() => {
    if (!gameActive) return;

    Object.keys(players).forEach(id => {
        const p = players[id];
        if (!p.alive) return;

        // Apply clean vector movement
        p.x += p.vx * 4.5;
        p.y += p.vy * 4.5;

        if (p.x < 0) p.x = 0; if (p.x > MAP_SIZE) p.x = MAP_SIZE;
        if (p.y < 0) p.y = 0; if (p.y > MAP_SIZE) p.y = MAP_SIZE;

        const currentPos = { x: p.x, y: p.y };
        const insideOwnTerritory = isPointInPolygon(currentPos, p.territory);

        if (!insideOwnTerritory) {
            // Leave a continuous smooth path ribbon when out in the wild
            if (p.vx !== 0 || p.vy !== 0) {
                p.trail.push({ x: p.x, y: p.y });
            }
        } else if (p.trail.length > 0) {
            // Paper.io Fill Logic: Append your trail vertices into your boundary shape
            p.territory = p.territory.concat(p.trail);
            p.trail = [];
        }
    });

    // Trail Collision Engine (Paper.io style)
    Object.keys(players).forEach(idA => {
        const pA = players[idA];
        if (!pA.alive) return;

        Object.keys(players).forEach(idB => {
            const pB = players[idB];
            if (!pB.alive) return;

            // Look through player B's trail points
            pB.trail.forEach((trailPoint, index) => {
                // Prevent self-killing on immediate trail generation lag
                if (idA === idB && index > pB.trail.length - 8) return;

                const dist = Math.hypot(pA.x - trailPoint.x, pA.y - trailPoint.y);
                if (dist < 10) { 
                    // The player whose trail was touched is eliminated!
                    pB.alive = false;
                    pB.trail = [];
                }
            });
        });
    });

    // Score calculations
    Object.keys(players).forEach(id => {
        const p = players[id];
        p.score = p.alive ? Math.floor(p.territory.length * 2) : 0;
    });

    timeRemaining -= 1 / 20;
    if (timeRemaining <= 0) {
        gameActive = false;
        let highestScore = -1;
        Object.keys(players).forEach(id => {
            if (players[id].score > highestScore) {
                highestScore = players[id].score;
                winner = players[id];
            }
        });
        setTimeout(resetGame, 5000);
    }

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