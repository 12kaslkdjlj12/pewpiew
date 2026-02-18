const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const httpServer = http.createServer(app);
const io = new Server(httpServer);

// In-memory players map: { socketId: { position: {x,y,z}, name } }
const players = {};

// Simple spawn points
const spawnPoints = [
  { x: 0, y: 0.5, z: 0 },
  { x: 4, y: 0.5, z: 0 },
  { x: -4, y: 0.5, z: 0 },
  { x: 0, y: 0.5, z: 4 },
  { x: 0, y: 0.5, z: -4 }
];

// respawn cooldown (ms) advertised to clients
const RESPAWN_COOLDOWN_MS = 5000; // 5s cooldown between respawns per player

// Simple objectives (for minimap markers)
const objectives = [
  { id: 'flag1', x: 8, y: 0.5, z: 8, name: 'Flag A' },
  { id: 'flag2', x: -8, y: 0.5, z: -6, name: 'Flag B' }
];

function chooseSpawn(index) {
  if (typeof index === 'number' && spawnPoints[index]) return spawnPoints[index];
  return spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
}

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  // send map data (spawn points, objectives) and existing players to the new client
  socket.emit('map:data', { spawnPoints, objectives, respawnCooldownMs: RESPAWN_COOLDOWN_MS });
  socket.emit('players:init', players);

  // allow client to send join info (name & optional spawn)
  socket.on('player:join', ({ name, spawnIndex, color } = {}) => {
    // validate spawn index
    let chosenIndex = null;
    if (typeof spawnIndex === 'number' && spawnIndex >= 0 && spawnIndex < spawnPoints.length) chosenIndex = spawnIndex;
    const pos = chooseSpawn(chosenIndex);
    // validate color (simple hex check) or assign random
    let finalColor = '#'+Math.floor(Math.random()*0xffffff).toString(16).padStart(6,'0');
    if (typeof color === 'string' && /^#?[0-9a-fA-F]{6}$/.test(color)) {
      finalColor = color.startsWith('#') ? color : `#${color}`;
    }

    players[socket.id] = { position: pos, name: name || `Player_${socket.id.slice(0,4)}`, color: finalColor };
    // inform all others
    socket.broadcast.emit('player:joined', { id: socket.id, state: players[socket.id] });
    // confirm join to the joining client (in case it wants to read assigned spawn)
    socket.emit('player:joined:you', { id: socket.id, state: players[socket.id] });
  });

  socket.on('player:update', (data) => {
    if (!players[socket.id]) return;
    players[socket.id].position = data.position;
    socket.broadcast.emit('player:update', { id: socket.id, position: data.position });
  });

  // allow respawn requests: choose a spawn point and teleport player
  socket.on('player:respawn', ({ spawnIndex, color } = {}) => {
    if (!players[socket.id]) return;
    const now = Date.now();
    players[socket.id].lastRespawn = players[socket.id].lastRespawn || 0;
    const elapsed = now - players[socket.id].lastRespawn;
    if (elapsed < RESPAWN_COOLDOWN_MS) {
      const remaining = Math.ceil((RESPAWN_COOLDOWN_MS - elapsed) / 1000);
      socket.emit('player:respawn:denied', { remaining });
      return;
    }

    // validate spawn index
    let chosenIndex = null;
    if (typeof spawnIndex === 'number' && spawnIndex >= 0 && spawnIndex < spawnPoints.length) chosenIndex = spawnIndex;
    const pos = chooseSpawn(chosenIndex);
    players[socket.id].position = pos;
    // allow changing color on respawn
    if (typeof color === 'string' && /^#?[0-9a-fA-F]{6}$/.test(color)) {
      players[socket.id].color = color.startsWith('#') ? color : `#${color}`;
    }
    // update lastRespawn
    players[socket.id].lastRespawn = now;
    // notify the respawning client of its new state
    socket.emit('player:joined:you', { id: socket.id, state: players[socket.id] });
    // notify others about the position change
    socket.broadcast.emit('player:update', { id: socket.id, position: pos });
    // also notify others about color change if any
    socket.broadcast.emit('player:meta', { id: socket.id, meta: { color: players[socket.id].color } });
  });

  socket.on('disconnect', () => {
    console.log('socket disconnected', socket.id);
    delete players[socket.id];
    socket.broadcast.emit('player:remove', { id: socket.id });
  });
});

httpServer.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
