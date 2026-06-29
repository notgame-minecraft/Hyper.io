const nameScreen = document.getElementById('nameScreen');
const nameInput = document.getElementById('nameInput');
const playButton = document.getElementById('playButton');
const gameContainer = document.getElementById('gameContainer');
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const leaderboardDiv = document.getElementById('leaderboard');
const statusDiv = document.getElementById('status');

// Game variables
let gameWidth = 1000;
let gameHeight = 1000;
let playerId = null;
let playerName = null;
let players = [];
let mouseX = 0;
let mouseY = 0;
let lastMouseX = 0;
let lastMouseY = 0;
let ws = null;
let connected = false;
let useKeyboardControl = false;
let gameStarted = false;
const GRID_SIZE = 10;

// Name screen handlers
playButton.addEventListener('click', startGame);
nameInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') startGame();
});

function startGame() {
  const name = nameInput.value.trim() || `Player${Math.floor(Math.random() * 10000)}`;
  playerName = name;
  nameScreen.style.display = 'none';
  gameContainer.style.display = 'flex';
  gameStarted = true;
  connectWebSocket();
}

nameInput.focus();

// Resize canvas
function resizeCanvas() {
  const maxWidth = Math.min(window.innerWidth - 270, 1000);
  const maxHeight = Math.min(window.innerHeight - 40, 1000);

  canvas.width = maxWidth;
  canvas.height = maxHeight;
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// WebSocket connection
function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${window.location.host}`);

  ws.onopen = () => {
    connected = true;
    statusDiv.textContent = '● Connected';
    statusDiv.className = 'connection-status connected';
    console.log('Connected to server');
    
    if (ws && connected) {
      ws.send(JSON.stringify({ type: 'setName', name: playerName }));
    }
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'init') {
      playerId = data.playerId;
      gameWidth = data.gameWidth;
      gameHeight = data.gameHeight;
      console.log(`Initialized as ${playerName} (${playerId})`);
    } else if (data.type === 'gameState') {
      players = data.players;
      updateLeaderboard();
      
      const currentPlayer = players.find((p) => p.id === playerId);
      if (currentPlayer && currentPlayer.trail.length > 0) {
        checkCaptureOpportunity();
      }
    }
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };

  ws.onclose = () => {
    connected = false;
    statusDiv.textContent = '● Disconnected';
    statusDiv.className = 'connection-status disconnected';
    console.log('Disconnected from server');
    setTimeout(() => connectWebSocket(), 2000);
  };
}

function checkCaptureOpportunity() {
  const currentPlayer = players.find((p) => p.id === playerId);
  if (!currentPlayer || !currentPlayer.trail || currentPlayer.trail.length < 6) return;

  const start = currentPlayer.trail[0];
  const end = currentPlayer.trail[currentPlayer.trail.length - 1];
  const distToStart = Math.hypot(end.x - start.x, end.y - start.y);

  if (distToStart < 80) {
    if (ws && connected) {
      ws.send(JSON.stringify({ type: 'captureCheck' }));
    }
  }
}

// Input handling
document.addEventListener('mousemove', (e) => {
  const newMouseX = e.clientX;
  const newMouseY = e.clientY;
  
  // If mouse moved significantly, disable keyboard control
  if (Math.hypot(newMouseX - lastMouseX, newMouseY - lastMouseY) > 5) {
    useKeyboardControl = false;
  }
  
  mouseX = newMouseX;
  mouseY = newMouseY;
  lastMouseX = newMouseX;
  lastMouseY = newMouseY;
});

document.addEventListener('touchmove', (e) => {
  if (e.touches.length > 0) {
    mouseX = e.touches[0].clientX;
    mouseY = e.touches[0].clientY;
    useKeyboardControl = false;
  }
  e.preventDefault();
});

const keys = {};
document.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  keys[key] = true;
  
  // Enable keyboard control when WASD is pressed
  if (key === 'w' || key === 'a' || key === 's' || key === 'd') {
    useKeyboardControl = true;
  }
});

document.addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
});

// Game update
function updatePlayer() {
  if (!connected) return;

  const rect = canvas.getBoundingClientRect();
  let vx = 0;
  let vy = 0;

  if (useKeyboardControl) {
    // Keyboard input only
    if (keys['w']) vy -= 1;
    if (keys['s']) vy += 1;
    if (keys['a']) vx -= 1;
    if (keys['d']) vx += 1;
  } else {
    // Mouse/touch input
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = mouseX - centerX;
    const dy = mouseY - centerY;
    const dist = Math.hypot(dx, dy);

    if (dist > 10) {
      vx += dx / dist;
      vy += dy / dist;
    }
  }

  // Normalize
  const mag = Math.hypot(vx, vy);
  if (mag > 0) {
    vx /= mag;
    vy /= mag;
  }

  // Send movement to server
  if (ws && connected) {
    ws.send(JSON.stringify({ type: 'move', vx, vy }));
  }
}

function updateLeaderboard() {
  const sorted = [...players].sort((a, b) => b.score - a.score).slice(0, 10);

  leaderboardDiv.innerHTML = sorted
    .map((p, i) => {
      const isYou = p.id === playerId;
      const statusClass = isYou ? 'player-info you' : 'player-info';
      const status = p.alive ? '✓' : '✗';

      return `
        <div class="${statusClass}">
          <div class="player-name">${i + 1}. ${p.name} ${status}</div>
          <div class="player-score">${Math.floor(p.score)} points</div>
        </div>
      `;
    })
    .join('');
}

// Drawing
function drawGame() {
  // Draw outside background
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#87CEEB'); // Sky blue
  gradient.addColorStop(0.7, '#87CEEB');
  gradient.addColorStop(1, '#90EE90'); // Grass green
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw grass ground
  ctx.fillStyle = '#7CB342';
  ctx.fillRect(0, canvas.height * 0.65, canvas.width, canvas.height * 0.35);

  if (!playerId) return;

  // Find current player
  const currentPlayer = players.find((p) => p.id === playerId);
  if (!currentPlayer) return;

  // Calculate scale and offset to center on current player
  const scaleX = canvas.width / gameWidth;
  const scaleY = canvas.height / gameHeight;
  const scale = Math.min(scaleX, scaleY);

  // Center player on screen
  const offsetX = canvas.width / 2 - currentPlayer.x * scale;
  const offsetY = canvas.height / 2 - currentPlayer.y * scale;

  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

  // Draw game area background
  ctx.fillStyle = '#E8F5E9';
  ctx.fillRect(0, 0, gameWidth, gameHeight);

  // Draw territory for all players
  players.forEach((player) => {
    ctx.fillStyle = player.color;
    ctx.globalAlpha = 0.3;
    player.territory.forEach((key) => {
      const [x, y] = key.split(',').map(Number);
      const gridX = x * GRID_SIZE;
      const gridY = y * GRID_SIZE;
      ctx.fillRect(gridX, gridY, GRID_SIZE, GRID_SIZE);
    });
    ctx.globalAlpha = 1;
  });

  // Draw grid for gameplay area
  ctx.strokeStyle = '#C8E6C9';
  ctx.lineWidth = 1 / scale;
  for (let x = 0; x < gameWidth; x += 100) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, gameHeight);
    ctx.stroke();
  }
  for (let y = 0; y < gameHeight; y += 100) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(gameWidth, y);
    ctx.stroke();
  }

  // Draw all players
  players.forEach((player) => {
    // Draw trail (thicker)
    ctx.strokeStyle = player.color;
    ctx.lineWidth = 6 / scale;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.8;

    if (player.trail.length > 1) {
      ctx.beginPath();
      ctx.moveTo(player.trail[0].x, player.trail[0].y);
      for (let i = 1; i < player.trail.length; i++) {
        ctx.lineTo(player.trail[i].x, player.trail[i].y);
      }
      ctx.stroke();
    }

    ctx.globalAlpha = 1;

    // Larger, more visible player body
    const isCurrentPlayer = player.id === playerId;
    const playerSize = isCurrentPlayer ? 12 : 8;

    if (player.alive) {
      ctx.fillStyle = player.color;
    } else {
      ctx.fillStyle = '#999';
    }
    ctx.fillRect(player.x - playerSize, player.y - playerSize, playerSize * 2, playerSize * 2);

    // Thick border
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3 / scale;
    ctx.strokeRect(player.x - playerSize, player.y - playerSize, playerSize * 2, playerSize * 2);

    // Draw player name
    ctx.fillStyle = '#000';
    ctx.font = `bold ${14 / scale}px Arial`;
    ctx.textAlign = 'center';
    ctx.globalAlpha = 0.95;
    ctx.fillText(player.name, player.x, player.y - playerSize - 8 / scale);
    
    // Label current player as "YOU"
    if (isCurrentPlayer) {
      ctx.fillStyle = '#FF0000';
      ctx.font = `bold ${10 / scale}px Arial`;
      ctx.fillText('YOU', player.x, player.y + playerSize + 8 / scale);
    }
    
    ctx.globalAlpha = 1;
  });

  ctx.restore();

  // Draw center crosshair to show your position
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2 - 15, canvas.height / 2);
  ctx.lineTo(canvas.width / 2 + 15, canvas.height / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2, canvas.height / 2 - 15);
  ctx.lineTo(canvas.width / 2, canvas.height / 2 + 15);
  ctx.stroke();

  // Draw HUD
  ctx.fillStyle = '#fff';
  ctx.font = '14px Arial';
  ctx.textAlign = 'left';
  if (currentPlayer) {
    ctx.fillText(`${currentPlayer.name} - ${Math.floor(currentPlayer.score)} pts`, 10, 20);
    ctx.fillText(`Players: ${players.filter((p) => p.alive).length}/${players.length}`, 10, 40);
  }
}

// Game loop
function gameLoop() {
  updatePlayer();
  drawGame();
  requestAnimationFrame(gameLoop);
}

gameLoop();
