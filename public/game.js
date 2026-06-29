const nameScreen = document.getElementById('nameScreen');
const nameInput = document.getElementById('nameInput');
const playButton = document.getElementById('playButton');
const gameContainer = document.getElementById('gameContainer');
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const leaderboardDiv = document.getElementById('leaderboard');
const statusDiv = document.getElementById('status');

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

let timeRemaining = 90;
let gameActive = true;
let winner = null;

// Clean Discord Activity Handshake
async function setupDiscordActivity() {
  if (typeof DiscordSDK === 'undefined') {
    console.log("Running in standard browser environment.");
    return;
  }
  try {
    const discordSdk = new DiscordSDK({ clientId: "1521223781362827395" });
    await discordSdk.ready();
    const auth = await discordSdk.commands.authorize({
      client_id: "1521223781362827395",
      response_type: "code",
      state: "",
      prompt: "none",
      scope: ["identify"],
    });
    
    if (auth) {
      await discordSdk.commands.authenticate({ access_token: auth.code });
      console.log("Discord Embedded Activity authorization complete!");
    }
  } catch (error) {
    console.error("Discord SDK initialization skipped or failed:", error);
  }
}

// Fire setup right away
setupDiscordActivity();

playButton.addEventListener('click', startGame);
nameInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') startGame(); });

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
      players = data.players;
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
  if (Math.hypot(newMouseX - lastMouseX, newMouseY - lastMouseY) > 5) useKeyboardControl = false;
  mouseX = newMouseX; mouseY = newMouseY;
  lastMouseX = newMouseX; lastMouseY = newMouseY;
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
    if (keys['w'] || keys['arrowup']) vy -= 1;
    if (keys['s'] || keys['arrowdown']) vy += 1;
    if (keys['a'] || keys['arrowleft']) vx -= 1;
    if (keys['d'] || keys['arrowright']) vx += 1;
  } else {
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = mouseX - centerX; const dy = mouseY - centerY;
    const dist = Math.hypot(dx, dy);
    if (dist > 10) { vx = dx / dist; vy = dy / dist; }
  }

  const mag = Math.hypot(vx, vy);
  if (mag > 0) { vx /= mag; vy /= mag; }
  if (ws && connected) ws.send(JSON.stringify({ type: 'move', vx, vy }));
}

function updateLeaderboard() {
  const sorted = [...players].sort((a, b) => b.score - a.score).slice(0, 10);
  leaderboardDiv.innerHTML = sorted.map((p, i) => {
    return `<div class="${p.id === playerId ? 'player-info you' : 'player-info'}">
      <div class="player-name">${i + 1}. ${p.name} ${p.alive ? '✓' : '✗'}</div>
      <div class="player-score">${Math.floor(p.score)} pts</div>
    </div>`;
  }).join('');
}

function drawGame() {
  ctx.fillStyle = '#87CEEB';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (!playerId || players.length === 0) return;
  const currentPlayer = players.find((p) => p.id === playerId);
  if (!currentPlayer) return;

  const scaleX = canvas.width / gameWidth;
  const scaleY = canvas.height / gameHeight;
  let scale = Math.min(scaleX, scaleY) * 2.2;

  const offsetX = canvas.width / 2 - currentPlayer.x * scale;
  const offsetY = canvas.height / 2 - currentPlayer.y * scale;

  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

  ctx.fillStyle = '#EAEAEA';
  ctx.fillRect(0, 0, gameWidth, gameHeight);

  // Draw smooth paper fills
  players.forEach((player) => {
    if (player.territory.length < 3) return;
    
    ctx.fillStyle = player.color;
    ctx.beginPath();
    ctx.moveTo(player.territory[0].x, player.territory[0].y);
    for (let i = 1; i < player.territory.length; i++) {
        ctx.lineTo(player.territory[i].x, player.territory[i].y);
    }
    ctx.closePath();
    ctx.fill();
    
    ctx.globalAlpha = 0.15;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1.0;
  });

  // Render active trailing line ribbons
  players.forEach((player) => {
    ctx.strokeStyle = player.color;
    ctx.lineWidth = 10; 
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
      ctx.fillStyle = player.color;
      ctx.beginPath();
      ctx.arc(player.x, player.y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#111111';
      ctx.font = `bold ${13 / scale}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(player.name, player.x, player.y - 16);
      
      if (player.id === playerId) {
        ctx.fillStyle = '#FF3B30';
        ctx.font = `bold ${10 / scale}px sans-serif`;
        ctx.fillText('YOU', player.x, player.y + 22);
      }
    }
  });

  ctx.restore();

  // Clear HUD text box setup
  ctx.fillStyle = 'rgba(20, 20, 20, 0.85)';
  ctx.fillRect(15, 15, 200, 85);

  ctx.fillStyle = '#FFF';
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'left';
  
  const minutes = Math.floor(timeRemaining / 60);
  const seconds = Math.floor(timeRemaining % 60);
  ctx.fillText(`⏱ Time: ${minutes}:${seconds.toString().padStart(2, '0')}`, 30, 40);
  ctx.font = '14px sans-serif';
  ctx.fillText(`Score: ${Math.floor(currentPlayer.score)} pts`, 30, 62);
  ctx.fillText(`Players: ${players.filter(p => p.alive).length}`, 30, 82);

  if (!gameActive && winner) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`🏆 Winner: ${winner.name}`, canvas.width / 2, canvas.height / 2);
  }
}

function gameLoop() {
  updatePlayer();
  drawGame();
  requestAnimationFrame(gameLoop);
}
gameLoop();