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

// Game state from server
let timeRemaining = 90;
let gameActive = true;
let winner = null;

// Discord SDK Integration
let discordSDK = null;
let isInDiscord = false;

async function initializeDiscord() {
  try {
    if (!window.DiscordSDK) return;
    
    const sdk = window.DiscordSDK;
    
    // Authorize the SDK
    await sdk.ready();
    
    const {code} = await sdk.commands.authorize({
      client_id: "1521223781362827395",
      response_type: "code",
      state: "",
      prompt: "none",
      scope: ["identify"],
    });

    const response = await sdk.commands.authenticate({access_token: code});
    
    if (response) {
      discordSDK = sdk;
      isInDiscord = true;
      console.log("✅ Discord Activity initialized!");
      
      // Listen for user changes
      sdk.subscribe("READY", (data) => {
        console.log("Discord ready:", data);
      });
    }
  } catch (err) {
    console.log("Standalone mode (not in Discord)");
    isInDiscord = false;
  }
}

// Initialize Discord SDK
initializeDiscord();

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
      // Convert territory arrays back to Sets
      players = data.players.map(p => ({
        ...p,
        territory: new Set(p.territory || [])
      }));
      
      // Update game state from server
      timeRemaining = data.timeRemaining || 90;
      gameActive = data.gameActive !== false;
      winner = data.winner || null;
      
      console.log(`Received gameState with ${players.length} players, time: ${Math.floor(timeRemaining)}s`);
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
  gradient.addColorStop(0, '#87CEEB');
  gradient.addColorStop(0.7, '#87CEEB');
  gradient.addColorStop(1, '#90EE90');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#7CB342';
  ctx.fillRect(0, canvas.height * 0.65, canvas.width, canvas.height * 0.35);

  // Debug: Show current state
  ctx.fillStyle = '#000';
  ctx.font = '12px Arial';
  ctx.textAlign = 'left';
  ctx.fillText(`Players: ${players.length} | Your ID: ${playerId ? playerId.substr(0, 8) : 'NOT SET'}`, 10, 95);

  if (!playerId || players.length === 0) {
    ctx.fillText('Waiting for game data...', 10, 115);
    return;
  }

  // Find current player
  const currentPlayer = players.find((p) => p.id === playerId);
  if (!currentPlayer) {
    ctx.fillText(`Error: You (${playerId.substr(0, 8)}) not found in players list!`, 10, 115);
    ctx.fillText(`Available players: ${players.map(p => p.id.substr(0, 4)).join(', ')}`, 10, 130);
    return;
  }

  const scaleX = canvas.width / gameWidth;
  const scaleY = canvas.height / gameHeight;
  let scale = Math.min(scaleX, scaleY);
  
  // More zoomed in view
  scale = scale * 2.0;

  const offsetX = canvas.width / 2 - currentPlayer.x * scale;
  const offsetY = canvas.height / 2 - currentPlayer.y * scale;

  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

  // Draw game area background
  ctx.fillStyle = '#E8F5E9';
  ctx.fillRect(0, 0, gameWidth, gameHeight);

  // Draw territory for all players (solid, no transparency)
  players.forEach((player) => {
    ctx.fillStyle = player.color;
    player.territory.forEach((key) => {
      const [x, y] = key.split(',').map(Number);
      const gridX = x * GRID_SIZE;
      const gridY = y * GRID_SIZE;
      ctx.fillRect(gridX, gridY, GRID_SIZE, GRID_SIZE);
    });
  });

  // Draw grid for gameplay area
  ctx.strokeStyle = '#C8E6C9';
  ctx.lineWidth = 1 / scale;
  for (let x = 0; x < gameWidth; x += 100) {
    ctx.beginPath();
    ctx.lineTo(x, 0);
    ctx.lineTo(x, gameHeight);
    ctx.stroke();
  }
  for (let y = 0; y < gameHeight; y += 100) {
    ctx.beginPath();
    ctx.lineTo(0, y);
    ctx.lineTo(gameWidth, y);
    ctx.stroke();
  }

  // Draw all players
  players.forEach((player) => {
    // Draw trail (Fixed line width to fix the "dots" trail issue)
    ctx.strokeStyle = player.color;
    ctx.lineWidth = 10; 
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

    // Smaller player body (much more zoomed in now)
    const isCurrentPlayer = player.id === playerId;
    const playerSize = isCurrentPlayer ? 4 : 3;

    if (player.alive) {
      // Make player color darker than territory
      ctx.fillStyle = player.color;
      ctx.globalAlpha = 0.7; // Darken by reducing opacity slightly
    } else {
      ctx.fillStyle = '#999';
    }
    ctx.fillRect(player.x - playerSize, player.y - playerSize, playerSize * 2, playerSize * 2);
    ctx.globalAlpha = 1;

    // Border
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1 / scale;
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

  // Draw HUD with dark backing container (fixes Discord visibility issue)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(5, 5, 190, 75);

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 16px Arial';
  ctx.textAlign = 'left';
  
  // Timer
  const minutes = Math.floor(timeRemaining / 60);
  const seconds = Math.floor(timeRemaining % 60);
  const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  ctx.fillText(`⏱ ${timeStr}`, 15, 25);
  
  if (currentPlayer) {
    ctx.font = '14px Arial';
    ctx.fillText(`${currentPlayer.name} - ${Math.floor(currentPlayer.score)} pts`, 15, 45);
    ctx.fillText(`Players: ${players.filter((p) => p.alive).length}/${players.length}`, 15, 65);
  }
  
  // Show winner when game ends
  if (!gameActive && winner) {
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(canvas.width / 2 - 150, canvas.height / 2 - 50, 300, 100);
    ctx.fillStyle = '#fff';
    ctx.fillText(`🏆 ${winner.name} Wins!`, canvas.width / 2, canvas.height / 2);
    ctx.font = '16px Arial';
    ctx.fillText(`Territory: ${Math.floor(winner.score)} pts`, canvas.width / 2, canvas.height / 2 + 30);
  }
}

// Game loop
function gameLoop() {
  updatePlayer();
  drawGame();
  requestAnimationFrame(gameLoop);
}

gameLoop();