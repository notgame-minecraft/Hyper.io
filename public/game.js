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
      sdk.subscribe("READY", (data) => {
        console.log("Discord ready:", data);
      });
    }
  } catch (err) {
    console.log("Standalone mode (not in Discord)");
    isInDiscord = false;
  }
}

initializeDiscord();

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

function resizeCanvas() {
  const maxWidth = Math.min(window.innerWidth - 270, 1000);
  const maxHeight = Math.min(window.innerHeight - 40, 1000);
  canvas.width = maxWidth;
  canvas.height = maxHeight;
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);

function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${window.location.host}`);

  ws.onopen = () => {
    connected = true;
    statusDiv.textContent = '● Connected';
    statusDiv.className = 'connection-status connected';
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
    } else if (data.type === 'gameState') {
      players = data.players.map(p => ({
        ...p,
        territory: new Set(p.territory || [])
      }));
      timeRemaining = data.timeRemaining || 90;
      gameActive = data.gameActive !== false;
      winner = data.winner || null;
      updateLeaderboard();
    }
  };

  ws.onclose = () => {
    connected = false;
    statusDiv.textContent = '● Disconnected';
    statusDiv.className = 'connection-status disconnected';
    setTimeout(() => connectWebSocket(), 2000);
  };
}

document.addEventListener('mousemove', (e) => {
  const newMouseX = e.clientX;
  const newMouseY = e.clientY;
  if (Math.hypot(newMouseX - lastMouseX, newMouseY - lastMouseY) > 5) {
    useKeyboardControl = false;
  }
  mouseX = newMouseX;
  mouseY = newMouseY;
  lastMouseX = newMouseX;
  lastMouseY = newMouseY;
});

const keys = {};
document.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  keys[key] = true;
  if (['w', 'a', 's', 'd'].includes(key)) useKeyboardControl = true;
});
document.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

function updatePlayer() {
  if (!connected) return;
  const rect = canvas.getBoundingClientRect();
  let vx = 0; let vy = 0;

  if (useKeyboardControl) {
    if (keys['w']) vy -= 1;
    if (keys['s']) vy += 1;
    if (keys['a']) vx -= 1;
    if (keys['d']) vx += 1;
  } else {
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = mouseX - centerX;
    const dy = mouseY - centerY;
    const dist = Math.hypot(dx, dy);
    if (dist > 10) { vx = dx / dist; vy = dy / dist; }
  }

  const mag = Math.hypot(vx, vy);
  if (mag > 0) { vx /= mag; vy /= mag; }
  if (ws && connected) { ws.send(JSON.stringify({ type: 'move', vx, vy })); }
}

function updateLeaderboard() {
  const sorted = [...players].sort((a, b) => b.score - a.score).slice(0, 10);
  leaderboardDiv.innerHTML = sorted.map((p, i) => {
    return `<div class="${p.id === playerId ? 'player-info you' : 'player-info'}">
      <div class="player-name">${i + 1}. ${p.name} ${p.alive ? '✓' : '✗'}</div>
      <div class="player-score">${Math.floor(p.score)} points</div>
    </div>`;
  }).join('');
}

function drawGame() {
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#87CEEB');
  gradient.addColorStop(0.7, '#87CEEB');
  gradient.addColorStop(1, '#90EE90');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (!playerId || players.length === 0) return;
  const currentPlayer = players.find((p) => p.id === playerId);
  if (!currentPlayer) return;

  const scaleX = canvas.width / gameWidth;
  const scaleY = canvas.height / gameHeight;
  let scale = Math.min(scaleX, scaleY) * 2.0;

  const offsetX = canvas.width / 2 - currentPlayer.x * scale;
  const offsetY = canvas.height / 2 - currentPlayer.y * scale;

  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

  ctx.fillStyle = '#E8F5E9';
  ctx.fillRect(0, 0, gameWidth, gameHeight);

  // DRAW TERRITORIES AS CIRCLES INSTEAD OF SQUARES
  players.forEach((player) => {
    ctx.fillStyle = player.color;
    player.territory.forEach((key) => {
      const [x, y] = key.split(',').map(Number);
      const centerX = x * GRID_SIZE + GRID_SIZE / 2;
      const centerY = y * GRID_SIZE + GRID_SIZE / 2;
      ctx.beginPath();
      ctx.arc(centerX, centerY, GRID_SIZE / 2 + 0.5, 0, Math.PI * 2);
      ctx.fill();
    });
  });

  // Trails and players
  players.forEach((player) => {
    // Solid ribbon trail
    ctx.strokeStyle = player.color;
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    if (player.trail.length > 1) {
      ctx.beginPath();
      ctx.moveTo(player.trail[0].x, player.trail[0].y);
      for (let i = 1; i < player.trail.length; i++) {
        ctx.lineTo(player.trail[i].x, player.trail[i].y);
      }
      ctx.stroke();
    }

    if (player.alive) {
      // CIRCULAR PLAYER BODY
      ctx.fillStyle = player.color;
      ctx.beginPath();
      ctx.arc(player.x, player.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#000';
      ctx.font = `bold ${14 / scale}px Arial`;
      ctx.textAlign = 'center';
      ctx.fillText(player.name, player.x, player.y - 12);
      
      if (player.id === playerId) {
        ctx.fillStyle = '#FF0000';
        ctx.font = `bold ${10 / scale}px Arial`;
        ctx.fillText('YOU', player.x, player.y + 16);
      }
    }
  });

  ctx.restore();

  // DARK HUD BOX FOR VISIBILITY ON DISCORD
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(10, 10, 200, 80);

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 16px Arial';
  ctx.textAlign = 'left';
  
  const minutes = Math.floor(timeRemaining / 60);
  const seconds = Math.floor(timeRemaining % 60);
  ctx.fillText(`⏱ Timer: ${minutes}:${seconds.toString().padStart(2, '0')}`, 20, 35);
  ctx.font = '14px Arial';
  ctx.fillText(`Score: ${Math.floor(currentPlayer.score)} pts`, 20, 55);
  ctx.fillText(`Alive: ${players.filter(p => p.alive).length}/${players.length}`, 20, 75);

  if (!gameActive && winner) {
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(canvas.width / 2 - 150, canvas.height / 2 - 50, 300, 100);
    ctx.fillStyle = '#fff';
    ctx.fillText(`🏆 ${winner.name} Wins!`, canvas.width / 2, canvas.height / 2);
  }
}

function gameLoop() {
  updatePlayer();
  drawGame();
  requestAnimationFrame(gameLoop);
}
gameLoop();