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

// In-memory players map: { socketId: { position: {x,y,z} } }
const players = {};

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  // send existing players to the new client
  socket.emit('players:init', players);

  // register this player with default state
  players[socket.id] = { position: { x: 0, y: 0.5, z: 0 } };
  socket.broadcast.emit('player:joined', { id: socket.id, state: players[socket.id] });

  socket.on('player:update', (data) => {
    players[socket.id] = players[socket.id] || {};
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
