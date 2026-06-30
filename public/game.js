const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const socket = new WebSocket(`wss://${window.location.host}`);

canvas.width = 1400; canvas.height = 1400;

window.addEventListener('mousemove', (e) => {
    socket.send(JSON.stringify({ type: 'move', x: e.clientX, y: e.clientY }));
});

socket.onmessage = (e) => {
    const { players } = JSON.parse(e.data);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    players.forEach(p => {
        ctx.fillStyle = p.color;
        p.territory.forEach(t => ctx.fillRect(t.x * 16, t.y * 16, 16, 16));
        ctx.fillStyle = 'white';
        ctx.fillRect(p.x, p.y, 8, 8);
        scoreEl.innerText = `Score: ${p.score}%`;
    });
};