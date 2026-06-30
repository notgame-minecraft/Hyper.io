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

wss.on('connection', (ws) => {
    const id = Math.random().toString(36).substr(2, 9);
    players[id] = { id, x: 700, y: 700, color: '#00BCD4', territory: [], score: 0 };
    
    ws.on('message', (msg) => {
        const data = JSON.parse(msg);
        if (data.type === 'move' && players[id]) {
            players[id].x = data.x;
            players[id].y = data.y;
            // Add territory logic: mark current grid cell as captured
            const gridX = Math.floor(data.x / CELL_SIZE);
            const gridY = Math.floor(data.y / CELL_SIZE);
            if (!players[id].territory.find(t => t.x === gridX && t.y === gridY)) {
                players[id].territory.push({ x: gridX, y: gridY });
                players[id].score = ((players[id].territory.length / 5000) * 100).toFixed(2);
            }
        }
    });

    ws.on('close', () => delete players[id]);
});

setInterval(() => {
    wss.clients.forEach(c => c.send(JSON.stringify({ players: Object.values(players) })));
}, 50);

server.listen(process.env.PORT || 10000);