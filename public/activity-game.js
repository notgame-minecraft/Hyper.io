const appId = "YOUR_DISCORD_APP_ID"; // same as your OAuth client ID

const discordSdk = new DiscordSDK(appId);

async function initActivity() {
    await discordSdk.ready();

    // Ask Discord for identity
    const { user } = await discordSdk.authorize();
    const { access_token } = await discordSdk.authenticate();

    console.log("Discord Activity User:", user);

    // Connect to your game server
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
