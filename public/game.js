const nameScreen = document.getElementById('nameScreen');
const nameInput = document.getElementById('nameInput');
const playButton = document.getElementById('playButton');
const gameContainer = document.getElementById('gameContainer');
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const playersList = document.getElementById('playersList');
const timerHUD = document.getElementById('timerHUD');
const gameOverScreen = document.getElementById('gameOverScreen');
const finalScore = document.getElementById('finalScore');
const respawnBtn = document.getElementById('respawnBtn');
const mainMenuBtn = document.getElementById('mainMenuBtn');

// Newly Added UI Selectors
const discordLoginBtn = document.getElementById('discordLoginBtn');
const userGreeting = document.getElementById('userGreeting');
const openSkinsBtn = document.getElementById('openSkinsBtn');
const closeSkinsBtn = document.getElementById('closeSkinsBtn');
const skinsModal = document.getElementById('skinsModal');
const skinsContainer = document.getElementById('skinsContainer');
const openBadgesBtn = document.getElementById('openBadgesBtn');
const closeBadgesBtn = document.getElementById('closeBadgesBtn');
const badgesModal = document.getElementById('badgesModal');

let gameWidth = 1400; let gameHeight = 1400;
const CELL_SIZE = 16;
let playerId = null; let playerName = null;
let players = [];
let mouseX = 0; let mouseY = 0;
let ws = null; let connected = false;
let isDead = false;
let currentTimerValue = 120;

// Read Discord login info from URL
const urlParams = new URLSearchParams(window.location.search);
const loggedUsername = urlParams.get('username');
const loggedDiscordId = urlParams.get('id');

// List of available customizable skins
const PALETTE_OPTIONS = ['#FF5722', '#E91E63', '#9C27B0', '#673AB7', '#3F51B5', '#00BCD4', '#4CAF50', '#FF9800'];
let chosenSkinColor = PALETTE_OPTIONS[0];

// Handle Modal View States
openSkinsBtn.addEventListener('click', () => { renderSkinGrid(); skinsModal.style.display = 'flex'; });
closeSkinsBtn.addEventListener('click', () => skinsModal.style.display = 'none');
openBadgesBtn.addEventListener('click', () => badgesModal.style.display = 'flex');
closeBadgesBtn.addEventListener('click', () => badgesModal.style.display = 'none');

// Discord OAuth Redirection Anchor Link
discordLoginBtn.addEventListener('click', () => {
    window.location.href = '/auth/discord';
});

// Check if player returned from a successful Discord Authorization redirect
function checkUserLoginSession() {
    if (loggedUsername) {
        nameInput.value = loggedUsername;
        userGreeting.textContent = `Logged in as: ${loggedUsername}`;
        userGreeting.style.display = 'block';
        discordLoginBtn.style.display = 'none';
    }
}
checkUserLoginSession();

function renderSkinGrid() {
    skinsContainer.innerHTML = PALETTE_OPTIONS.map(color => `
        <div class="skin-block ${chosenSkinColor === color ? 'selected' : ''}" 
             style="background:${color};" 
             onclick="selectSkinColor('${color}')">
        </div>
    `).join('');
}

window.selectSkinColor = function(color) {
    chosenSkinColor = color;
    renderSkinGrid();
};

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
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'init') {
                playerId = data.playerId;
                gameWidth = data.gameWidth;
                gameHeight = data.gameHeight;
            } else if (data.type === 'gameState') {
                players = data.players || [];
                
                if (data.gameTime !== undefined) {
                    currentTimerValue = data.gameTime;
                    updateTimerDisplay();
                }
                
                if (!playerId) return;
                const me = players.find(p => p.id === playerId);
                if (me && !me.alive && !isDead) {
                    isDead = true;
                    finalScore.textContent = `${me.score}% Coverage`;
                    gameOverScreen.style.display = 'flex';
                }
                updateLeaderboardHUD();
            }
        } catch(e) { console.error(e); }
    };
    ws.onclose = () => { connected = false; ws = null; playerId = null; };
}

function updateTimerDisplay() {
    let mins = Math.floor(currentTimerValue / 60);
    let secs = Math.floor(currentTimerValue % 60);
    timerHUD.textContent = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

setInterval(() => {
        // END GAME WHEN TIMER HITS ZERO
    if (gameTime <= 0) {
    Object.keys(players).forEach(id => {
        players[id].alive = false;
    });
    }

    if (connected && currentTimerValue > 0 && !isDead) {
        currentTimerValue = Math.max(0, currentTimerValue - 1);
        updateTimerDisplay();
    }
}, 1000);

function enterGameArena() {
    playerName = nameInput.value.trim() || `Paper${Math.floor(Math.random()*900)}`;
    nameScreen.style.display = 'none';
    gameContainer.style.display = 'flex';
    isDead = false;
    connectServer();
}

function sendSpawnIntent() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'spawn',
            name: playerName,
            skin: chosenSkinColor,
            discordId: loggedDiscordId || 'guest'
        }));
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
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeContainer);
resizeContainer();

document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX; mouseY = e.clientY;
});

function sendMovementVector() {
    if (!connected || isDead || !playerId) return;
    const me = players.find(p => p.id === playerId);
    if (!me || !me.alive) return;

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
    if (players.length === 0) return;
    const sorted = [...players].sort((a,b)=>parseFloat(b.score)-parseFloat(a.score)).slice(0,5);
    playersList.innerHTML = sorted.map((p, i) => `
        <div class="player-info ${p.id === playerId ? 'you' : ''}">
            <span style="display:flex; align-items:center;">
                <span class="player-color-badge" style="background:${p.color};"></span>
                ${i+1}. ${p.name}
            </span>
            <span>${p.score}%</span>
        </div>
    `).join('');
}

function drawGameFrame() {
    ctx.fillStyle = '#b2bec3';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!playerId || players.length === 0) { 
        requestAnimationFrame(drawGameFrame); 
        return; 
    }

    const me = players.find(p => p.id === playerId);
    if (!me) { requestAnimationFrame(drawGameFrame); return; }

    const offsetX = canvas.width / 2 - me.x;
    const offsetY = canvas.height / 2 - me.y;

    ctx.save();
    ctx.translate(offsetX, offsetY);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, gameWidth, gameHeight);

    ctx.strokeStyle = '#f1f2f6';
    ctx.lineWidth = 1;
    for (let x = 0; x < gameWidth; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, gameHeight); ctx.stroke();
    }
    for (let y = 0; y < gameHeight; y += 40) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(gameWidth, y); ctx.stroke();
    }

    players.forEach(p => {
        if (!p.territory) return;
        ctx.fillStyle = p.color;
        p.territory.forEach(cell => {
            ctx.fillRect(cell.x * CELL_SIZE - 0.3, cell.y * CELL_SIZE - 0.3, CELL_SIZE + 0.6, CELL_SIZE + 0.6);
        });
    });

    players.forEach(p => {
        if (!p.trail || p.trail.length < 1) return;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.moveTo(p.trail[0].x, p.trail[0].y);
        for(let i=1; i<p.trail.length; i++) { ctx.lineTo(p.trail[i].x, p.trail[i].y); }
        ctx.stroke();
        ctx.globalAlpha = 1.0;
    });

    players.forEach(p => {
        if (!p.alive) return;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5; ctx.stroke();

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
