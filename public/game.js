const params = new URLSearchParams(window.location.search);
const discordId = params.get("discordId");
const username = params.get("username");

const ws = new WebSocket("wss://hyper-io-tu3t.onrender.com");

ws.onopen = () => {
    ws.send(JSON.stringify({
        type: "spawn",
        discordId,
        name: username
    }));
};

ws.onmessage = (msg) => {
    console.log("Game:", JSON.parse(msg.data));
};
