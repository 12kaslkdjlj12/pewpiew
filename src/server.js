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

function chooseSpawn(index) {
  if (typeof index === 'number' && spawnPoints[index]) return spawnPoints[index];
  return spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
}

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  // send existing players to the new client
  socket.emit('players:init', players);

  // allow client to send join info (name & optional spawn)
  socket.on('player:join', ({ name, spawnIndex } = {}) => {
    const pos = chooseSpawn(spawnIndex);
    players[socket.id] = { position: pos, name: name || `Player_${socket.id.slice(0,4)}` };
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

  socket.on('disconnect', () => {
    console.log('socket disconnected', socket.id);
    delete players[socket.id];
    socket.broadcast.emit('player:remove', { id: socket.id });
  });
});

httpServer.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
