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

function getArea(territory) {
    // Basic fill logic: if loop is closed, fill interior
    return territory.length; 
}

wss.on('connection', (ws) => {
    const id = Math.random().toString(36).substr(2, 9);
    players[id] = { id, x: 700, y: 700, color: '#00BCD4', territory: [] };
    
    ws.on('message', (msg) => {
        const data = JSON.parse(msg);
        if (data.type === 'move') {
            players[id].x = data.x;
            players[id].y = data.y;
            const gridX = Math.floor(data.x / CELL_SIZE);
            const gridY = Math.floor(data.y / CELL_SIZE);
            
            if (!players[id].territory.find(t => t.x === gridX && t.y === gridY)) {
                players[id].territory.push({ x: gridX, y: gridY });
            }
        }
    });
    ws.on('close', () => delete players[id]);
});

setInterval(() => {
    wss.clients.forEach(c => {
        const payload = Object.values(players).map(p => ({
            ...p,
            score: ((p.territory.length / 500) * 100).toFixed(1)
        }));
        c.send(JSON.stringify({ players: payload }));
    });
}, 50);

server.listen(process.env.PORT || 10000);