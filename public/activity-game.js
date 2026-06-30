const appId = "1521223781362827395"; // SAME as OAuth client ID

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
            name: user.username
        }));
    };

    ws.onmessage = (msg) => {
        console.log("Game:", JSON.parse(msg.data));
    };
}

document.getElementById("start").onclick = initActivity;
