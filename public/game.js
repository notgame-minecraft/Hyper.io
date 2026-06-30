let discordId = null;
let username = null;
let ws = null;
let players = [];
let playerId = null;
let gameWidth = 1400;
let gameHeight = 1400;
let mouseX = 0, mouseY = 0;
let isDead = false;
let currentTimerValue = 120;

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const achievementToast = document.getElementById('achievementToast');

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// read OAuth params from URL
const urlParams = new URLSearchParams(window.location.search);
discordId = urlParams.get('discordId');
username = urlParams.get('username');

// if not logged in, send to /auth/discord
if (!discordId || !username) {
    window.location.href = '/auth/discord';
}

function showAchievementToast(text) {
    achievementToast.textContent = text;
    achievementToast.style.display = 'block';
    setTimeout(() => {
        achievementToast.style.display = 'none';
    }, 3000);
}

function startGame() {
    connectServer();
    requestAnimationFrame(drawGameFrame);
    setInterval(sendMovementVector, 50);
}

function connectServer() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onopen = () => {
        ws.send(JSON.stringify({
            type: 'spawn',
            name: username || `Guest${Math.floor(Math.random()*999)}`,
            skin: null,
            discordId: discordId || 'guest'
        }));
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === 'init') {
            playerId = data.playerId;
            gameWidth = data.gameWidth;
            gameHeight = data.gameHeight;
        }

        if (data.type === 'gameState') {
            players = data.players || [];
            currentTimerValue = data.gameTime || currentTimerValue;

            const me = players.find(p => p.id === playerId);

            if (me && !me.alive && !isDead) {
                isDead = true;
                showAchievementToast(`Game Over — Coverage: ${me.score}%`);
            }

            if (me && me.achievements && me.achievements.includes('full_map_control')) {
                showAchievementToast('Achievement Unlocked: FULL MAP CONTROL');
            }
        }
    };
}

document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
});

function sendMovementVector() {
    if (!ws || ws.readyState !== WebSocket.OPEN || !playerId || isDead) return;

    const me = players.find(p => p.id === playerId);
    if (!me || !me.alive) return;

    const dx = mouseX - (canvas.width / 2);
    const dy = mouseY - (canvas.height / 2);
    const dist = Math.hypot(dx, dy);

    let vx = 0, vy = 0;
    if (dist > 15) {
        vx = dx / dist;
        vy = dy / dist;
    }

    ws.send(JSON.stringify({ type: 'move', vx, vy }));
}

function drawGameFrame() {
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!playerId || players.length === 0) {
        requestAnimationFrame(drawGameFrame);
        return;
    }

    const me = players.find(p => p.id === playerId);
    if (!me) {
        requestAnimationFrame(drawGameFrame);
        return;
    }

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
            ctx.fillRect(cell.x * 16 - 0.3, cell.y * 16 - 0.3, 16 + 0.6, 16 + 0.6);
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
        for (let i = 1; i < p.trail.length; i++) {
            ctx.lineTo(p.trail[i].x, p.trail[i].y);
        }
        ctx.stroke();
        ctx.globalAlpha = 1.0;
    });

    players.forEach(p => {
        if (!p.alive) return;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5; ctx.stroke();

        ctx.fillStyle = '#2f3542';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(p.name, p.x, p.y - 18);
    });

    ctx.restore();
    requestAnimationFrame(drawGameFrame);
}

startGame();
