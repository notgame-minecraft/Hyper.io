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
const PLAYER_SIZE = 5;
const MOVE_SPEED = 2;
const GRID_SIZE = 10;
const GAME_DURATION = 90; // 1:30 in seconds

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Game state
const players = new Map();
const territories = new Set();
let gameStartTime = Date.now();
let gameActive = true;

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

    const currentKey = getKey(this.x, this.y);
    const inOwnTerritory = this.territory.has(currentKey);
    
    // Add trail when outside own territory
    if (!inOwnTerritory) {
      this.trail.push({ x: this.x, y: this.y });
      if (this.trail.length > 500) {
        this.trail.shift();
      }
    } else if (inOwnTerritory && this.trail.length > 0) {
      // Returned to own territory - capture!
      this.pendingCapture = true;
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
  if (player.trail.length < 10) return; // Need minimum trail length
  
  // Capture all cells inside the trail
  const capturedCells = new Set();
  for (let x = 0; x < GAME_WIDTH; x += GRID_SIZE) {
    for (let y = 0; y < GAME_HEIGHT; y += GRID_SIZE) {
      const point = { x: x + GRID_SIZE / 2, y: y + GRID_SIZE / 2 };
      if (pointInPolygon(point, player.trail)) {
        const key = getKey(x, y);
        capturedCells.add(key);
      }
    }
  }
  
  if (capturedCells.size === 0) return;
  
  // Steal territory from other players
  players.forEach((otherPlayer) => {
    if (otherPlayer.id !== player.id) {
      capturedCells.forEach((key) => {
        if (otherPlayer.territory.has(key)) {
          otherPlayer.territory.delete(key);
        }
      });
    }
  });
  
  // Add captured cells to player
  capturedCells.forEach((key) => {
    player.territory.add(key);
  });
  
  console.log(`${player.name} captured ${capturedCells.size} cells!`);
  return true;
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
  const elapsed = (Date.now() - gameStartTime) / 1000;
  const timeRemaining = Math.max(0, GAME_DURATION - elapsed);
  
  const gameState = {
    type: 'gameState',
    gameActive,
    timeRemaining,
    winner: null,
    players: Array.from(players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      x: p.x,
      y: p.y,
      trail: p.trail,
      alive: p.alive,
      color: p.color,
      score: Math.floor(p.getTerritoryArea()),
      territory: Array.from(p.territory),
    })),
  };
  
  // Determine winner if game is over
  if (!gameActive && gameState.players.length > 0) {
    gameState.winner = gameState.players.reduce((a, b) => a.score > b.score ? a : b);
  }

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(gameState));
    }
  });
}

function updateGame() {
  // Check if game is over
  const elapsed = (Date.now() - gameStartTime) / 1000;
  if (elapsed > GAME_DURATION && gameActive) {
    gameActive = false;
    console.log('Game Over!');
  }

  // Update all players
  players.forEach((player) => {
    if (player.alive) {
      player.update();
    }
  });

  // Process pending captures
  players.forEach((player) => {
    if (player.alive && player.pendingCapture && player.trail.length > 10) {
      captureTerritory(player);
      player.trail = [];
      player.pendingCapture = false;
    }
  });

  // Check collisions between players and enemy trails
  players.forEach((player) => {
    if (!player.alive || player.trail.length === 0) return;
    
    // Check if player hit any other player's trail
    players.forEach((otherPlayer) => {
      if (otherPlayer.id === player.id || otherPlayer.trail.length === 0) return;
      
      // Check if player is in other player's trail
      for (let trailPoint of otherPlayer.trail) {
        const dist = Math.hypot(player.x - trailPoint.x, player.y - trailPoint.y);
        if (dist < 15) {
          // Hit enemy trail!
          player.alive = false;
          otherPlayer.trail = [];
          break;
        }
      }
    });
  });

  // Check collisions between players (direct hit)
  const playerArray = Array.from(players.values());
  for (let i = 0; i < playerArray.length; i++) {
    for (let j = i + 1; j < playerArray.length; j++) {
      const p1 = playerArray[i];
      const p2 = playerArray[j];

      if (p1.alive && p2.alive && checkCollision(p1, p2)) {
        p1.alive = false;
        p2.territory = new Set([...p2.territory, ...p1.territory]);
      }
    }
  }

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

// Reset game every 2 minutes
setInterval(() => {
  gameStartTime = Date.now();
  gameActive = true;
  players.forEach((player) => {
    player.trail = [];
    player.territory = new Set();
    player.alive = true;
    player.x = Math.random() * GAME_WIDTH;
    player.y = Math.random() * GAME_HEIGHT;
    
    for (let dx = -GRID_SIZE; dx <= GRID_SIZE; dx += GRID_SIZE) {
      for (let dy = -GRID_SIZE; dy <= GRID_SIZE; dy += GRID_SIZE) {
        const key = getKey(player.x + dx, player.y + dy);
        player.territory.add(key);
      }
    }
  });
  console.log('Game reset!');
}, 120000);

server.listen(PORT, HOST, () => {
  const url = process.env.NODE_ENV === 'production' 
    ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'localhost:' + PORT}`
    : `http://localhost:${PORT}`;
  console.log(`Hyper.io server running on ${url}`);
});
