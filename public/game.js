const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const socket = new WebSocket(`wss://${window.location.host}`);

let players = [];
socket.onmessage = (event) => {
    players = JSON.parse(event.data).players;
    draw();
};

window.addEventListener('keydown', (e) => {
    let vx = 0, vy = 0;
    if (e.key === 'ArrowUp') vy = -1;
    else if (e.key === 'ArrowDown') vy = 1;
    else if (e.key === 'ArrowLeft') vx = -1;
    else if (e.key === 'ArrowRight') vx = 1;
    socket.send(JSON.stringify({ type: 'move', vx, vy }));
});

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    players.forEach(p => {
        ctx.fillStyle = p.color;
        p.territory.forEach(t => ctx.fillRect(t.x * 16, t.y * 16, 16, 16));
        ctx.fillStyle = 'white';
        ctx.fillRect(p.x, p.y, 16, 16);
    });
}