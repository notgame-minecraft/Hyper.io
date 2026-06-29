# Hyper.io 🎮

A fast-paced multiplayer territory control .io game where players compete to capture the most area and eliminate opponents.

## Features

- **Multiplayer gameplay** - Real-time WebSocket synchronization for smooth, lag-free gaming
- **Territory control** - Capture areas of the map by drawing and closing loops
- **Competitive scoring** - Earn points for territory size and eliminating opponents
- **Live leaderboard** - Track your ranking against other players
- **Responsive controls** - Move with mouse/touch or WASD keys
- **Auto-respawn** - Get back in the action quickly after elimination

## Getting Started

### Installation

```bash
npm install
```

### Running the Server

```bash
npm start
```

The server will start on `http://localhost:3000`

### Playing the Game

1. Open your browser to `http://localhost:3000`
2. Share the link with friends to join the same game
3. Move your character using your mouse or WASD keys
4. The game area is 1000x1000 pixels - explore and capture territory!

## How to Play

- **Move**: Use your mouse/trackpad to aim, or use WASD keys
- **Capture**: Leave a trail as you move - when you return to your starting point and close a loop, you capture that territory
- **Eliminate**: Collide with other players while they're in mid-trail to eliminate them and steal their points
- **Survive**: Stay alive as long as possible and control the largest territory
- **Leaderboard**: Check the right sidebar to see your ranking and other players' scores

## Game Mechanics

- Players move at constant speed in the direction they're aiming
- Each player leaves a visible trail behind them
- Colliding with another player eliminates both players (if both are moving, the survivor gets 100 bonus points)
- Dead players respawn after 5 seconds at a random location
- Territory is calculated by dividing the map into grid squares and tracking which player controls each square
- Score increases as you expand your territory

## Architecture

- **Backend**: Node.js + Express with WebSocket support
- **Frontend**: HTML5 Canvas with real-time rendering
- **Communication**: WebSocket for low-latency multiplayer synchronization
- **Game Loop**: 30 FPS server updates with 60 FPS client rendering

## Development

To customize the game, edit these files:

- `server.js` - Game logic, physics, collision detection
- `public/game.js` - Client rendering and input handling
- `public/index.html` - UI and styling

Adjust these constants in `server.js` to modify gameplay:
- `GAME_WIDTH` / `GAME_HEIGHT` - Map size
- `MOVE_SPEED` - Player movement speed
- `PLAYER_SIZE` - Player collision radius

## License

MIT