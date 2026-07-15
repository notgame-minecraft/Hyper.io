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
let currentTimerValue = 180; // Changed to 3 minutes (180 seconds)

const PALETTE_OPTIONS = ['#FF5722', '#E91E63', '#9C27B0', '#673AB7', '#3F51B5', '#00BCD4', '#4CAF50', '#FF9800'];
let chosenSkinColor = PALETTE_OPTIONS[0];

const DISCORD_CLIENT_ID = '1521223781362827395';
let discordSdk = null;
let discordUser = null;

openSkinsBtn.addEventListener('click', () => { renderSkinGrid(); skinsModal.style.display = 'flex'; });
closeSkinsBtn.addEventListener('click', () => {
    skinsModal.style.display = 'none';
    saveSkinIfLoggedIn();
});
openBadgesBtn.addEventListener('click', () => badgesModal.style.display = 'flex');
closeBadgesBtn.addEventListener('click', () => badgesModal.style.display = 'none');

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

async function saveSkinIfLoggedIn() {
    if (!discordUser) return;
    try {
        await fetch('//.proxy/api/save-skin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: discordUser.id, skin: chosenSkinColor }),
        });
    } catch (e) {
        console.error('Failed to save skin:', e);
    }
}

async function loadSavedSkin(userId) {
    try {
        const res = await fetch(`/.proxy/api/get-skin/${userId}`);
        const data = await res.json();
        if (data.skin) {
            chosenSkinColor = data.skin;
        }
    } catch (e) {
        console.error('Failed to load saved skin:', e);
    }
}

async function initDiscordAuth() {
    if (typeof DiscordSDK === 'undefined') {
        console.warn('Discord Embedded App SDK not loaded — are you running this outside Discord? Login disabled.');
        discordLoginBtn.style.display = 'none';
        return;
    }

    try {
        discordSdk = new DiscordSDK(DISCORD_CLIENT_ID);
        await discordSdk.ready();
    } catch (e) {
        console.error('Discord SDK failed to init (likely not running inside Discord):', e);
        discordLoginBtn.style.display = 'none';
        return;
    }

    discordLoginBtn.addEventListener('click', doDiscordLogin);
}

async function doDiscordLogin() {
    try {
        const { code } = await discordSdk.commands.authorize({
            client_id: DISCORD_CLIENT_ID,
            response_type: 'code',
            state: '',
            prompt: 'none',
            scope: ['identify'],
        });

        const tokenRes = await fetch('//.proxy/api/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code }),
        });
        const { access_token, error } = await tokenRes.json();
        if (error || !access_token) {
            console.error('Token exchange failed:', error);
            return;
        }

        const auth = await discordSdk.commands.authenticate({ access_token });
        discordUser = auth.user;

        nameInput.value = discordUser.username;
        userGreeting.textContent = `Logged in as: ${discordUser.username}`;
        userGreeting.style.display = 'block';
        discordLoginBtn.style.display = 'none';

        await loadSavedSkin(discordUser.id);
        renderSkinGrid();
    } catch (e) {
        console.error('Discord login flow failed:', e);
    }
}

initDiscordAuth();

playButton.addEventListener('click', enterGameArena);
respawnBtn.addEventListener('click', respawnPlayer);
mainMenuBtn.addEventListener('click', returnToMainMenu);

function connectServer() {
    if (ws) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socketUrl = "wss://hyper-io-backend.werewolfoutside.workers.dev/";

    // Correctly initialize the WebSocket connection
    ws = new WebSocket(socketUrl);

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

                    // Game Over Triggers if match duration runs out
                    if (currentTimerValue <= 0 && !isDead) {
                        isDead = true;
                        const me = players.find(p => p.id === playerId);
                        finalScore.textContent = `${me ? me.score : '0.00'}% Coverage`;
                        gameOverScreen.style.display = 'flex';
                    }
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
        ws.send(JSON.stringify({ type: 'spawn', name: playerName, skin: chosenSkinColor }));
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

// Sends mouse tracking system configuration vectors out to server loop
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
