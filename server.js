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

function generateInitialTerritory(centerX, centerY) {
    let points = [];
    const radius = 50; 
    for (let a = 0; a < Math.PI * 2; a += 0.4) {
        points.push({
            x: Math.round(centerX + Math.cos(a) * radius),
            y: Math.round(centerY + Math.sin(a) * radius)
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
        p.x = Math.floor(Math.random() * (MAP_SIZE - 200)) + 100;
        p.y = Math.floor(Math.random() * (MAP_SIZE - 200)) + 100;
        p.trail = [];
        p.alive = true;
        p.score = 100;
        p.territory = generateInitialTerritory(p.x, p.y);
    });
}

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
    const startX = Math.floor(Math.random() * (MAP_SIZE - 200)) + 100;
    const startY = Math.floor(Math.random() * (MAP_SIZE - 200)) + 100;
    
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

        // Regular fixed layout step intervals
        p.x += p.vx * 5.0;
        p.y += p.vy * 5.0;

        if (p.x < 0) p.x = 0; if (p.x > MAP_SIZE) p.x = MAP_SIZE;
        if (p.y < 0) p.y = 0; if (p.y > MAP_SIZE) p.y = MAP_SIZE;

        const currentPos = { x: Math.round(p.x), y: Math.round(p.y) };
        const insideOwnTerritory = isPointInPolygon(currentPos, p.territory);

        if (!insideOwnTerritory) {
            // Keep drawing the path line
            if (p.vx !== 0 || p.vy !== 0) {
                p.trail.push({ x: currentPos.x, y: currentPos.y });
            }
        } else if (p.trail.length > 0) {
            // Clean Append: We weave the trail coordinates securely to stop clipping loops
            let newTerritory = [...p.territory];
            p.trail.forEach(pt => {
                if (!isPointInPolygon(pt, newTerritory)) {
                    newTerritory.push(pt);
                }
            });
            p.territory = newTerritory;
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

            pB.trail.forEach((trailPoint, index) => {
                if (idA === idB && index > pB.trail.length - 6) return;

                const dist = Math.hypot(pA.x - trailPoint.x, pA.y - trailPoint.y);
                if (dist < 12) { 
                    pB.alive = false;
                    pB.trail = [];
                }
            });
        });
    });

    // Keep point scores synchronized with polygon bounds count
    Object.keys(players).forEach(id => {
        const p = players[id];
        p.score = p.alive ? Math.floor(p.territory.length * 10) : 0;
    });

    timeRemaining -= 0.05;
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
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));