const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ENV VARS (Render)
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI;

// ---------- OAUTH ROUTES MUST COME FIRST ----------

app.get('/auth/discord', (req, res) => {
    const redirect = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(DISCORD_REDIRECT_URI)}&response_type=code&scope=identify`;
    res.redirect(redirect);
});

app.get('/auth/discord/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) return res.send('No code provided');

    try {
        const tokenResponse = await axios.post(
            'https://discord.com/api/oauth2/token',
            new URLSearchParams({
                client_id: DISCORD_CLIENT_ID,
                client_secret: DISCORD_CLIENT_SECRET,
                grant_type: 'authorization_code',
                code,
                redirect_uri: DISCORD_REDIRECT_URI
            }),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );

        const accessToken = tokenResponse.data.access_token;

        const userResponse = await axios.get('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        const user = userResponse.data;

        res.redirect(`/index.html?discordId=${user.id}&username=${encodeURIComponent(user.username)}`);
    } catch (err) {
        console.error(err);
        res.send('OAuth failed');
    }
});

// ---------- STATIC FILES AFTER OAUTH ROUTES ----------

app.use(express.static(path.join(__dirname, 'public')));

// ---------- GAME STATE / WEBSOCKET ----------

const MAP_SIZE = 1400;
const CELL_SIZE = 16;
const TOTAL_CELLS = Math.pow(Math.floor(MAP_SIZE / CELL_SIZE), 2);
let players = {};
let gameTime = 120;

const COLOR_POOL = [
    '#FF5722', '#E91E63', '#9C27B0', '#673AB7',
    '#3F51B5', '#00BCD4', '#4CAF50', '#FF9800',
    '#FFC107', '#009688'
];

let usedColors = new Set();

let playerData = {};
try {
    playerData = JSON.parse(fs.readFileSync('playerData.json'));
} catch {
    playerData = {};
}

function savePlayerData() {
    fs.writeFileSync('playerData.json', JSON.stringify(playerData, null, 2));
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

function fillCapturedTerritory(territory, trail) {
    let cellMap = new Map();
    territory.forEach(c => cellMap.set(`${c.x},${c.y}`, { x: c.x, y: c.y }));
    trail.forEach(t => cellMap.set(`${t.gX},${t.gY}`, { x: t.gX, y: t.gY }));

    let trailX = trail.map(t => t.gX);
    let trailY = trail.map(t => t.gY);
    let minX = Math.min(...trailX) - 1;
    let maxX = Math.max(...trailX) + 1;
    let minY = Math.min(...trailY) - 1;
    let maxY = Math.max(...trailY) + 1;

    for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
            if (!cellMap.has(`${x},${y}`)) {
                let intersections = 0;
                for (let i = x; i <= maxX; i++) {
                    if (cellMap.has(`${i},${y}`)) {
                        intersections++;
                        break;
                    }
                }
                if (intersections > 0) cellMap.set(`${x},${y}`, { x, y });
            }
        }
    }
    return Array.from(cellMap.values());
}

function assignUniqueColor(requestedColor) {
    if (requestedColor && !usedColors.has(requestedColor)) {
        usedColors.add(requestedColor);
        return requestedColor;
    }
    for (const color of COLOR_POOL) {
        if (!usedColors.has(color)) {
            usedColors.add(color);
            return color;
        }
    }
    return COLOR_POOL[Math.floor(Math.random() * COLOR_POOL.length)];
}

function freeColor(color) {
    if (usedColors.has(color)) usedColors.delete(color);
}

wss.on('connection', (ws) => {
    const playerId = Math.random().toString(36).substr(2, 9);

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'spawn') {
                const discordId = data.discordId || 'guest';

                if (!playerData[discordId]) {
                    playerData[discordId] = {
                        skins: [],
                        achievements: []
                    };
                    savePlayerData();
                }

                const userInfo = playerData[discordId];

                const sX = Math.floor(Math.random() * (MAP_SIZE - 300)) + 150;
                const sY = Math.floor(Math.random() * (MAP_SIZE - 300)) + 150;

                const color = assignUniqueColor(data.skin);

                players[playerId] = {
                    id: playerId,
                    discordId,
                    name: data.name ? data.name.substring(0, 12) : 'Guest',
                    x: sX,
                    y: sY,
                    vx: 0,
                    vy: 0,
                    color,
                    unlockedSkins: userInfo.skins,
                    achievements: userInfo.achievements,
                    trail: [],
                    territory: generateInitialTerritory(sX, sY),
                    alive: true,
                    score: 0
                };

                ws.send(JSON.stringify({
                    type: 'init',
                    playerId,
                    gameWidth: MAP_SIZE,
                    gameHeight: MAP_SIZE
                }));
            }

            const player = players[playerId];
            if (!player || !player.alive) return;

            if (data.type === 'move') {
                player.vx = data.vx || 0;
                player.vy = data.vy || 0;
            }

        } catch (e) {
            console.error(e);
        }
    });

    ws.on('close', () => {
        const p = players[playerId];
        if (p) freeColor(p.color);
        delete players[playerId];
    });
});

setInterval(() => {
    if (gameTime > 0) gameTime -= 0.05;
    if (gameTime <= 0) {
        Object.keys(players).forEach(id => {
            players[id].alive = false;
        });
    }

    Object.keys(players).forEach(id => {
        const p = players[id];
        if (!p.alive) return;

        p.x += p.vx * 5.5;
        p.y += p.vy * 5.5;

        if (p.x < 0) p.x = 0;
        if (p.x > MAP_SIZE) p.x = MAP_SIZE;
        if (p.y < 0) p.y = 0;
        if (p.y > MAP_SIZE) p.y = MAP_SIZE;

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
        p.score = p.alive ? calculatedPercentage.toFixed(2) : "0.00";

        if (p.discordId && calculatedPercentage >= 100) {
            if (!playerData[p.discordId].achievements.includes("full_map_control")) {
                playerData[p.discordId].achievements.push("full_map_control");
                savePlayerData();
            }
        }
    });

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
                type: 'gameState',
                players: Object.values(players),
                gameTime: Math.max(0, gameTime)
            }));
        }
    });

}, 50);

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Hyper.io running on port ${PORT}`));
