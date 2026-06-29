const nameScreen = document.getElementById('nameScreen');
const nameInput = document.getElementById('nameInput');
const playButton = document.getElementById('playButton');
const gameContainer = document.getElementById('gameContainer');
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const playersList = document.getElementById('playersList');
const gameOverScreen = document.getElementById('gameOverScreen');
const finalScore = document.getElementById('finalScore');
const respawnBtn = document.getElementById('respawnBtn');
const mainMenuBtn = document.getElementById('mainMenuBtn');

let gameWidth = 1400; let gameHeight = 1400;
const CELL_SIZE = 16;
let playerId = null; let playerName = null;
let players = [];
let mouseX = 0; let mouseY = 0;
let ws = null; let connected = false;
let isDead = false;

if (typeof DiscordSDK !== 'undefined') {
    const discordSdk = new DiscordSDK({ clientId: "1521223781362827395" });
    discordSdk.ready().then(() => discordSdk.commands.authorize({
        client_id: "1521223781362827395", response_type: "code", state: "", prompt: "none", scope: ["identify"]
    })).then(auth => discordSdk.commands.authenticate({ access_token: auth.code }))
      .catch(e => console.log("Standard runtime configuration loaded"));
}

playButton.addEventListener('click', enterGameArena);
respawnBtn.addEventListener('click', respawnPlayer);
mainMenuBtn.addEventListener('click', returnToMainMenu);

function connectServer() {
    if (ws) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onopen = () => {
        connected = true;
        sendSpawnIntent();
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'init') {
            playerId = data.playerId;
            gameWidth = data.gameWidth;
            gameHeight = data.gameHeight;
        } else if (data.type === 'gameState') {
            players = data.players;
            
            const me = players.find(p => p.id === playerId);
            if (me) {
                if (!me.alive && !isDead) {
                    isDead = true;
                    finalScore.textContent = `Your Score: ${me.score} pts`;
                    gameOverScreen.style.display = 'flex';
                }
            }
            updateLeaderboardHUD();
        }
    };

    ws.onclose = () => { connected = false; ws = null; };
}

function enterGameArena() {
    playerName = nameInput.value.trim() || `Paper${Math.floor(Math.random()*900)}`;
    nameScreen.style.display = 'none';
    gameContainer.style.display = 'flex';
    isDead = false;
    connectServer();
}

function sendSpawnIntent() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'spawn', name: playerName }));
    }
}

function respawnPlayer() {
    gameOverScreen.style.display = 'none';
    isDead = false;
    sendSpawnIntent();
}

function returnToMainMenu() {
    gameOverScreen.style.display = 'none';
    gameContainer.style.display = 'none';
    nameScreen.style.display = 'flex';
    if(ws) { ws.close(); }
}

function resizeContainer() {
    canvas.width = Math.min(window.innerWidth, 1100);
    canvas.height = Math.min(window.innerHeight, 900);
}
window.addEventListener('resize', resizeContainer);
resizeContainer();

document.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
});

function sendMovementVector() {
    if (!connected || isDead) return;
    const dx = mouseX - (canvas.width / 2);
    const dy = mouseY - (canvas.height / 2);
    const dist = Math.hypot(dx, dy);
    
    let vx = 0; let vy = 0;
    if (dist > 15) { vx = dx / dist; vy = dy / dist; }
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'move', vx, vy }));
    }
}

function updateLeaderboardHUD() {
    const sorted = [...players].sort((a,b)=>b.score-a.score).slice(0,5);
    playersList.innerHTML = sorted.map((p, i) => `
        <div class="player-info ${p.id === playerId ? 'you' : ''}">
            <span>${i+1}. ${p.name}</span>
            <span>${p.score}</span>
        </div>
    `).join('');
}

function drawGameFrame() {
    ctx.fillStyle = '#b2bec3';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const me = players.find(p => p.id === playerId);
    if (!me) { requestAnimationFrame(drawGameFrame); return; }

    const offsetX = canvas.width / 2 - me.x;
    const offsetY = canvas.height / 2 - me.y;

    ctx.save();
    ctx.translate(offsetX, offsetY);

    // Arena Floor
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, gameWidth, gameHeight);

    // Soft Arena Grid Accents
    ctx.strokeStyle = '#f1f2f6';
    ctx.lineWidth = 1;
    for (let x = 0; x < gameWidth; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, gameHeight); ctx.stroke();
    }
    for (let y = 0; y < gameHeight; y += 40) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(gameWidth, y); ctx.stroke();
    }

    // Render Filled Territories Completely Seam-Free
    players.forEach(p => {
        ctx.fillStyle = p.color;
        p.territory.forEach(cell => {
            // Slight sizing expansion completely covers up underlying 90s gaps
            ctx.fillRect(cell.x * CELL_SIZE - 0.5, cell.y * CELL_SIZE - 0.5, CELL_SIZE + 1.5, CELL_SIZE + 1.5);
        });
    });

    // Drawing Path Ribbons
    players.forEach(p => {
        if (p.trail.length < 1) return;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalAlpha = 0.5;
        
        ctx.beginPath();
        ctx.moveTo(p.trail[0].x, p.trail[0].y);
        for(let i=1; i<p.trail.length; i++) {
            ctx.lineTo(p.trail[i].x, p.trail[i].y);
        }
        ctx.stroke();
        ctx.globalAlpha = 1.0;
    });

    // Heads
    players.forEach(p => {
        if (!p.alive) return;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 10, 0, Math.PI*2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        ctx.fillStyle = '#2f3542';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(p.name, p.x, p.y - 18);
    });

    ctx.restore();
    requestAnimationFrame(drawGameFrame);
}

setInterval(sendMovementVector, 50);
requestAnimationFrame(drawGameFrame);