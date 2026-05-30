const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.static(path.join(__dirname, 'public')));

// ── State ──────────────────────────────────────────────────────────────────
const waitingQueue = []; // sockets waiting for a match
const rooms = {};        // roomId → RoomState

function makeRoom(p1, p2) {
  const roomId = `room_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  rooms[roomId] = {
    players: { [p1.id]: p1, [p2.id]: p2 },
    hp: { [p1.id]: 100, [p2.id]: 100 },
    started: false,
    ended: false,
    timer: null,
    timeLeft: 180, // seconds
  };
  return roomId;
}

function getRoomOf(socketId) {
  return Object.entries(rooms).find(([, r]) =>
    r.players[socketId]
  );
}

function getOpponent(room, socketId) {
  return Object.keys(room.players).find(id => id !== socketId);
}

function startCountdown(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  room.started = true;

  room.timer = setInterval(() => {
    room.timeLeft--;
    io.to(roomId).emit('tick', { timeLeft: room.timeLeft });

    if (room.timeLeft <= 0) {
      clearInterval(room.timer);
      if (!room.ended) {
        room.ended = true;
        const [id1, id2] = Object.keys(room.players);
        const hp1 = room.hp[id1];
        const hp2 = room.hp[id2];
        let winnerId = null;
        if (hp1 > hp2) winnerId = id1;
        else if (hp2 > hp1) winnerId = id2;
        // tie → winnerId stays null
        io.to(roomId).emit('gameOver', { winnerId, hp: room.hp });
      }
    }
  }, 1000);
}

// ── Connection ─────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[+] ${socket.id} connected`);

  // ── Join / Matchmaking ─────────────────────────────────────────────────
  socket.on('join', ({ playerName }) => {
    socket.playerName = playerName || 'Jugador';

    if (waitingQueue.length > 0) {
      const opponent = waitingQueue.shift();

      // make sure opponent is still connected
      if (!opponent.connected) {
        waitingQueue.push(socket);
        socket.emit('waiting');
        return;
      }

      const roomId = makeRoom(opponent, socket);
      socket.join(roomId);
      opponent.join(roomId);

      socket.roomId = roomId;
      opponent.roomId = roomId;

      // player1 = opponent (waited longer), player2 = socket (just joined)
      opponent.emit('matched', {
        roomId,
        opponentName: socket.playerName,
        myName: opponent.playerName,
        side: 'bottom', // each player always sees themselves at the bottom
      });
      socket.emit('matched', {
        roomId,
        opponentName: opponent.playerName,
        myName: socket.playerName,
        side: 'bottom',
      });

      // 3-second countdown then start
      let count = 3;
      const cd = setInterval(() => {
        io.to(roomId).emit('countdown', { count });
        count--;
        if (count < 0) {
          clearInterval(cd);
          io.to(roomId).emit('gameStart', { timeLeft: 180 });
          startCountdown(roomId);
        }
      }, 1000);

    } else {
      waitingQueue.push(socket);
      socket.emit('waiting');
    }
  });

  // ── Game Events ────────────────────────────────────────────────────────

  // Player launches an item in a lane
  socket.on('launch', (data) => {
    // data: { roomId, lane, itemType, itemId, launchTime }
    const entry = getRoomOf(socket.id);
    if (!entry) return;
    const [roomId, room] = entry;
    if (room.ended) return;

    const opponentId = getOpponent(room, socket.id);
    const opponent = room.players[opponentId];
    if (opponent) {
      opponent.emit('opponentLaunch', {
        lane: data.lane,
        itemType: data.itemType,
        itemId: data.itemId,
        launchTime: data.launchTime,
      });
    }
  });

  // Player reports taking damage (item reached their base)
  socket.on('baseDamage', ({ damage, roomId }) => {
    const room = rooms[roomId];
    if (!room || room.ended) return;

    room.hp[socket.id] = Math.max(0, room.hp[socket.id] - damage);

    const opponentId = getOpponent(room, socket.id);

    // Tell victim their new HP
    socket.emit('hpUpdate', { hp: room.hp[socket.id] });
    // Tell attacker (opponent) their attack landed
    if (room.players[opponentId]) {
      room.players[opponentId].emit('opponentHp', { hp: room.hp[socket.id] });
    }

    if (room.hp[socket.id] <= 0 && !room.ended) {
      room.ended = true;
      clearInterval(room.timer);
      io.to(roomId).emit('gameOver', { winnerId: opponentId, hp: room.hp });
    }
  });

  // ── Disconnect ─────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`[-] ${socket.id} disconnected`);

    // Remove from queue
    const qi = waitingQueue.indexOf(socket);
    if (qi !== -1) waitingQueue.splice(qi, 1);

    // Notify room partner
    const entry = getRoomOf(socket.id);
    if (entry) {
      const [roomId, room] = entry;
      if (!room.ended) {
        room.ended = true;
        clearInterval(room.timer);
        socket.to(roomId).emit('opponentDisconnected');
      }
      delete rooms[roomId];
    }
  });
});

// ── Start ──────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () =>
  console.log(`🎮  RPS Battle server running → http://localhost:${PORT}`)
);
