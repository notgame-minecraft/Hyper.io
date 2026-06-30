const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const socket = new WebSocket(`wss://${window.location.host}`);

let playerId = null;
let players = [];

// Handle URL parameter for username
const urlParams = new URLSearchParams(window.location.search);
const username = urlParams.get('username') || 'Guest';

socket.onopen = () => {
    socket.send(JSON.stringify({ type: 'spawn', name: username }));
};

socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'init') playerId = data.playerId;
    if (data.type === 'gameState') {
        players = data.players;
        draw();
    }
};

window.addEventListener('keydown', (e) => {
    let vx = 0, vy = 0;
    if (e.key === 'ArrowUp') vy = -1;
    if (e.key === 'ArrowDown') vy = 1;
    if (e.key === 'ArrowLeft') vx = -1;
    if (e.key === 'ArrowRight') vx = 1;
    socket.send(JSON.stringify({ type: 'move', vx, vy }));
});

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    players.forEach(p => {
        // Draw Territory
        ctx.fillStyle = p.color;
        p.territory.forEach(t => ctx.fillRect(t.x * 16, t.y * 16, 16, 16));
        // Draw Player
        ctx.beginPath();
        ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillText(p.name, p.x - 10, p.y - 15);
    });
}