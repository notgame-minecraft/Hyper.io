const appId = "1521223781362827395"; // replace this

const discordSdk = new DiscordSDK(appId);

async function initActivity() {
    await discordSdk.ready();

    const { user } = await discordSdk.authorize();
    const { access_token } = await discordSdk.authenticate();

    console.log("Discord Activity User:", user);

    const ws = new WebSocket("wss://hyper-io-tu3t.onrender.com");

    ws.onopen = () => {
        ws.send(JSON.stringify({
            type: "spawn",
            discordId: user.id,
            name: user.username,
            skin: null
        }));
    };

    ws.onmessage = (msg) => {
        const data = JSON.parse(msg.data);
        console.log("Game:", data);
    };
}

document.getElementById("start").onclick = initActivity;
