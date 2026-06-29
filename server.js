const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const HOST = process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost';
const GAME_WIDTH = 1000;
const GAME_HEIGHT = 1000;
const PLAYER_SIZE = 8;
const MOVE_SPEED = 2;
const GRID_SIZE = 10;

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Game state
const players = new Map();
const territories = new Set();

class Player {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.x = Math.random() * (GAME_WIDTH - 60) + 30;
    this.y = Math.random() * (GAME_HEIGHT - 60) + 30;
    this.vx = 0;
    this.vy = 0;
    this.trail = [];
    this.territory = new Set();
    this.alive = true;
    this.score = 0;
    this.color = `hsl(${Math.random() * 360}, 70%, 50%)`;
    
    // Create initial 3x3 territory around spawn point
    for (let dx = -GRID_SIZE; dx <= GRID_SIZE; dx += GRID_SIZE) {
      for (let dy = -GRID_SIZE; dy <= GRID_SIZE; dy += GRID_SIZE) {
        const key = getKey(this.x + dx, this.y + dy);
        this.territory.add(key);
      }
    }
  }

  update() {
    if (!this.alive) return;

    // Update position
    this.x += this.vx * MOVE_SPEED;
    this.y += this.vy * MOVE_SPEED;

    // Wrap around screen
    this.x = (this.x + GAME_WIDTH) % GAME_WIDTH;
    this.y = (this.y + GAME_HEIGHT) % GAME_HEIGHT;

    // Add to trail
    this.trail.push({ x: this.x, y: this.y });

    // Keep trail limited
    if (this.trail.length > 300) {
      this.trail.shift();
    }
  }

  getTerritoryArea() {
    return this.territory.size;
  }
}

function getKey(x, y) {
  return `${Math.floor(x / GRID_SIZE)},${Math.floor(y / GRID_SIZE)}`;
}

function pointInPolygon(point, polygon) {
  const x = point.x, y = point.y;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function captureTerritory(player) {
  if (player.trail.length < 6) return;
  
  // Check if trail forms a closed loop
  const start = player.trail[0];
  const end = player.trail[player.trail.length - 1];
  const distToStart = Math.hypot(end.x - start.x, end.y - start.y);
  
  if (distToStart > 80) return;
  
  // Capture all cells inside the trail
  const capturedCells = new Set();
  for (let x = 0; x < GAME_WIDTH; x += GRID_SIZE) {
    for (let y = 0; y < GAME_HEIGHT; y += GRID_SIZE) {
      const point = { x: x + GRID_SIZE / 2, y: y + GRID_SIZE / 2 };
      if (pointInPolygon(point, player.trail)) {
        const key = getKey(x, y);
        if (!player.territory.has(key)) {
          capturedCells.add(key);
          player.territory.add(key);
        }
      }
    }
  }
  
  return capturedCells.size > 0;
}

function isPlayerInOwnTerritory(player) {
  const key = getKey(player.x, player.y);
  return player.territory.has(key);
}

function checkCollision(p1, p2) {
  const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
  return dist < PLAYER_SIZE * 2;
}

wss.on('connection', (ws) => {
  const playerId = Math.random().toString(36).substr(2, 9);
  let playerName = `Player ${playerId.substr(0, 4)}`;
  const player = new Player(playerId, playerName);
  players.set(playerId, player);

  console.log(`Player joined: ${playerName} (${playerId})`);

  // Send initial state
  ws.send(JSON.stringify({
    type: 'init',
    playerId,
    playerName,
    gameWidth: GAME_WIDTH,
    gameHeight: GAME_HEIGHT,
  }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'setName') {
        playerName = data.name;
        player.name = data.name;
        console.log(`Player renamed: ${playerName} (${playerId})`);
      } else if (data.type === 'move') {
        player.vx = data.vx;
        player.vy = data.vy;
      } else if (data.type === 'captureCheck') {
        const captured = captureTerritory(player);
        if (captured) {
          player.trail = [];
        }
      }
    } catch (e) {
      console.error('Invalid message:', e);
    }
  });

  ws.on('close', () => {
    players.delete(playerId);
    console.log(`Player left: ${playerName}`);
    broadcastGameState();
  });
});

function broadcastGameState() {
  const gameState = {
    type: 'gameState',
    players: Array.from(players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      x: p.x,
      y: p.y,
      trail: p.trail,
      alive: p.alive,
      color: p.color,
      score: Math.floor(p.getTerritoryArea()),
    })),
  };

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(gameState));
    }
  });
}

function updateGame() {
  // Update all players
  players.forEach((player) => {
    if (player.alive) {
      player.update();
    }
  });

  // Check collisions between players
  const playerArray = Array.from(players.values());
  for (let i = 0; i < playerArray.length; i++) {
    for (let j = i + 1; j < playerArray.length; j++) {
      const p1 = playerArray[i];
      const p2 = playerArray[j];

      if (p1.alive && p2.alive && checkCollision(p1, p2)) {
        p1.alive = false;
        p2.score += 100;
      }
    }
  }

  // Update territory
  players.forEach((player) => {
    if (player.alive && player.trail.length > 0) {
      const key = getKey(player.x, player.y);
      player.territory.add(key);
    }
  });

  // Broadcast game state
  broadcastGameState();
}

function respawnDeadPlayers() {
  players.forEach((player) => {
    if (!player.alive) {
      player.x = Math.random() * GAME_WIDTH;
      player.y = Math.random() * GAME_HEIGHT;
      player.trail = [];
      player.territory = new Set();
      player.alive = true;
    }
  });
}

// Game loop
setInterval(() => {
  updateGame();
}, 30); // ~33 FPS

// Respawn dead players every 5 seconds
setInterval(() => {
  respawnDeadPlayers();
}, 5000);

server.listen(PORT, HOST, () => {
  const url = process.env.NODE_ENV === 'production' 
    ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'localhost:' + PORT}`
    : `http://localhost:${PORT}`;
  console.log(`Hyper.io server running on ${url}`);
});
