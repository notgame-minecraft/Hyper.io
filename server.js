const express = require("express");
const path = require("path");
const axios = require("axios");
const WebSocket = require("ws");

const app = express();
const PORT = process.env.PORT || 10000;

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// WebSocket server
const wss = new WebSocket.Server({ noServer: true });

wss.on("connection", (ws) => {
    ws.on("message", (msg) => {
        const data = JSON.parse(msg);

        if (data.type === "spawn") {
            ws.send(JSON.stringify({
                type: "spawned",
                id: data.discordId,
                name: data.name
            }));
        }
    });
});

// Discord OAuth config
const CLIENT_ID = "1521223781362827395";
const CLIENT_SECRET = "9yF8iMTLhWK5mosZJyYvhcHeeZR_H7us";
const REDIRECT_URI = "https://hyper-io-tu3t.onrender.com/auth/discord/callback";

// Detect Discord Activity iframe
app.get("/", (req, res) => {
    const isDiscordActivity = req.headers["sec-fetch-dest"] === "iframe";

    if (isDiscordActivity) {
        // Discord Activity → NO OAuth
        res.sendFile(path.join(__dirname, "public/activity.html"));
    } else {
        // Web browser → OAuth login
        res.redirect("/auth/discord");
    }
});

// OAuth start
app.get("/auth/discord", (req, res) => {
    const url =
        `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&response_type=code&scope=identify`;

    res.redirect(url);
});

// OAuth callback
app.get("/auth/discord/callback", async (req, res) => {
    const code = req.query.code;

    try {
        const tokenRes = await axios.post(
            "https://discord.com/api/oauth2/token",
            new URLSearchParams({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                grant_type: "authorization_code",
                code,
                redirect_uri: REDIRECT_URI
            }),
            { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
        );

        const accessToken = tokenRes.data.access_token;

        const userRes = await axios.get("https://discord.com/api/users/@me", {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        const user = userRes.data;

        res.redirect(`/index.html?discordId=${user.id}&username=${encodeURIComponent(user.username)}`);
    } catch (err) {
        console.error(err);
        res.send("OAuth failed");
    }
});

// Upgrade HTTP → WebSocket
const server = app.listen(PORT, () => {
    console.log(`Hyper.io running on port ${PORT}`);
});

server.on("upgrade", (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
    });
});
