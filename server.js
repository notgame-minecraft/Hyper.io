require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;

if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET) {
    console.warn('WARNING: DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET not set in environment.');
}

const MAP_SIZE = 1400;
const CELL_SIZE = 16;
const TOTAL_CELLS = Math.pow(Math.floor(MAP_SIZE / CELL_SIZE), 2);
let players = {};
let gameTime = 180; // 3 minutes 

const COLOR_POOL = ['#FF5722', '#E91E63', '#9C27B0', '#673AB7', '#3F51B5', '#00BCD4', '#4CAF50', '#FF9800', '#FFC107', '#009688'];
let userSkins = {};

app.post('/api/token', async (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'missing code' });

    try {
        const tokenResponse = await fetch('https://discord.com/api/v10/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: DISCORD_CLIENT_ID,
                client_secret: DISCORD_CLIENT_SECRET,
                grant_type: 'authorization_code',
                code,
            }),
        });

        const tokenData = await tokenResponse.json();

        if (!tokenResponse.ok) {
            console.error('Discord token exchange failed:', tokenData);
            return res.status(400).json({ error: 'token exchange failed', details: tokenData });
        }

        res.json({ access_token: tokenData.access_token });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'internal error' });
    }
});

app.post('/api/save-skin', (req, res) => {
    const { userId, skin } = req.body;
    if (!userId || !skin) return res.status(400).json({ error: 'missing userId or skin' });
    userSkins[userId] = skin;
    res.json({ ok: true });
});

app.get('/api/get-skin/:userId', (req, res) => {
    const skin = userSkins[req.params.userId];
    res.json({ skin: skin || null });
});

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

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'spawn') {
                const sX = Math.floor(Math.random() * (MAP_SIZE - 300)) + 150;
                const sY = Math.floor(Math.random() * (MAP_SIZE - 300)) + 150;

                const takenColors = Object.values(players).filter(p => p.alive).map(p => p.color);
                let assignedColor = data.skin;

                if (!assignedColor || takenColors.includes(assignedColor)) {
                    const availableColors = COLOR_POOL.filter(c => !takenColors.includes(c));
                    if (availableColors.length > 0) {
                        assignedColor = availableColors[Math.floor(Math.random() * availableColors.length)];
                    } else {
                        assignedColor = COLOR_POOL[Math.floor(Math.random() * COLOR_POOL.length)];
                    }
                }

                players[playerId] = {
                    id: playerId,
                    name: data.name ? data.name.substring(0, 12) : 'Guest',
                    x: sX, y: sY, vx: 0, vy: 0,
                    color: assignedColor,
                    trail: [],
                    territory: generateInitialTerritory(sX, sY),
                    alive: true, score: "0.00"
                };
                ws.send(JSON.stringify({ type: 'init', playerId, gameWidth: MAP_SIZE, gameHeight: MAP_SIZE }));
            }
            const player = players[playerId];
            if (!player || !player.alive) return;
            if (data.type === 'move') {
                player.vx = data.vx || 0; player.vy = data.vy || 0;
            }
        } catch (e) { console.error(e); }
    });
    ws.on('close', () => { delete players[playerId]; });
});

// CORE LOOP WITH AUTOMATIC RESET MECHANISM
setInterval(() => {
    if (gameTime > 0) {
        gameTime -= 0.05;
    } else {
        // The instant countdown hits zero, reset loop state variables
        gameTime = 180; 
        
        Object.keys(players).forEach(id => {
            players[id].alive = false;
            players[id].trail = [];
            players[id].territory = [];
        });
    }

    Object.keys(players).forEach(id => {
        const p = players[id];
        if (!p.alive) return;

        p.x += p.vx * 5.5; p.y += p.vy * 5.5;
        if (p.x < 0) p.x = 0; if (p.x > MAP_SIZE) p.x = MAP_SIZE;
        if (p.y < 0) p.y = 0; if (p.y > MAP_SIZE) p.y = MAP_SIZE;

        const currentGridX = Math.floor(p.x / CELL_SIZE);
        const currentGridY = Math.floor(p.y / CELL_SIZE);
        const insideOwn = p.territory.some(t => t.x === currentGridX && t.y === currentGridY);

        if (!insideOwn) {
            if (p.vx !== 0 || p.vy !== 0) {
                const lastTrail = p.trail[p.trail.length - 1];
                if (!lastTrail || lastTrail.gX !== currentGridX || lastTrail.gY !== currentGridY) {
                    p.trail.push({ x: p.x, y: p.y, gX: currentGridX, gY: currentGridY });
                }
            }
        } else if (p.trail.length > 0) {
            p.territory = fillCapturedTerritory(p.territory, p.trail);
            p.trail = [];
            Object.keys(players).forEach(otherId => {
                if (otherId === id) return;
                players[otherId].territory = players[otherId].territory.filter(cell => {
                    return !p.territory.some(t => t.x === cell.x && t.y === cell.y);
                });
            });
        }
    });

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
                    let killerMap = new Map();
                    pA.territory.forEach(c => killerMap.set(`${c.x},${c.y}`, c));
                    pB.territory.forEach(c => killerMap.set(`${c.x},${c.y}`, c));
                    pA.territory = Array.from(killerMap.values());
                    pB.territory = [];
                }
            });
        });
    });

    Object.keys(players).forEach(id => {
        const p = players[id];
        let calculatedPercentage = (p.territory.length / TOTAL_CELLS) * 100;
        if (p.alive) {
            p.score = calculatedPercentage.toFixed(2);
        }
    });

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'gameState', players: Object.values(players), gameTime: Math.max(0, gameTime) }));
        }
    });
}, 50);

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Active core running on port ${PORT}`));