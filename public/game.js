const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// The protocol is 'wss' because Render requires secure connections
const socket = new WebSocket(`wss://${window.location.host}`);

socket.onopen = () => {
    console.log("Connected to server!");
    const urlParams = new URLSearchParams(window.location.search);
    const username = urlParams.get('username') || 'Guest';
    socket.send(JSON.stringify({ type: 'spawn', name: username }));
};

socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'gameState') {
        renderGame(data.players);
    }
};

function renderGame(players) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    players.forEach(p => {
        ctx.fillStyle = p.color;
        p.territory.forEach(t => ctx.fillRect(t.x * 16, t.y * 16, 16, 16));
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillText(p.name, p.x - 10, p.y - 15);
    });
}