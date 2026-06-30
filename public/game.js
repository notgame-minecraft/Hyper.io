const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const socket = new WebSocket(`wss://${window.location.host}`);

canvas.width = 1400; canvas.height = 1400;

let player = { x: 700, y: 700 };

window.addEventListener('mousemove', (e) => {
    player.x = e.clientX;
    player.y = e.clientY;
    socket.send(JSON.stringify({ type: 'move', x: player.x, y: player.y }));
});

socket.onmessage = (e) => {
    const { players } = JSON.parse(e.data);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    players.forEach(p => {
        ctx.fillStyle = p.color;
        p.territory.forEach(t => ctx.fillRect(t.x * 16, t.y * 16, 16, 16));
        ctx.fillStyle = 'white';
        ctx.fillRect(p.x, p.y, 10, 10);
        if (p.id === socket.id) scoreEl.innerText = `Score: ${p.score}%`;
    });
};