const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const analytics = require('./analytics');
const { createBot, runBot } = require('./bot');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// Wait this long for a human rival before matching against a bot
const BOT_WAIT_MS = Number(process.env.BOT_WAIT_MS) || 12000;
const BOT_REMATCH_WAIT_MS = 2500; // rematch after a bot game: don't make them wait again
const ADMIN_KEY = process.env.ADMIN_KEY;

app.use(express.static(path.join(__dirname, 'public')));

// Client-side analytics events (sent with navigator.sendBeacon)
app.post('/api/event', express.json({ limit: '2kb', type: ['application/json', 'text/plain'] }), (req, res) => {
  const { event, playerId, props } = req.body || {};
  analytics.trackClient(event, playerId, props);
  res.sendStatus(204);
});

// Stats dashboard – disabled unless ADMIN_KEY is set
app.get('/admin/stats', (req, res) => {
  if (!ADMIN_KEY || req.query.key !== ADMIN_KEY) return res.sendStatus(404);
  res.type('html').send(analytics.renderStats({
    online: io.engine.clientsCount,
    queue: waitingQueue.length,
    rooms: Object.values(rooms).filter(r => !r.ended).length,
  }));
});

// ── State ──────────────────────────────────────────────────────────────────
const waitingQueue = []; // sockets waiting for a match
const rooms = {};        // roomId → RoomState

function makeRoom(p1, p2) {
  const roomId = `room_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  rooms[roomId] = {
    players: { [p1.id]: p1, [p2.id]: p2 },
    hp: { [p1.id]: 100, [p2.id]: 100 },
    launches: { [p1.id]: 0, [p2.id]: 0 },
    vsBot: !!(p1.isBot || p2.isBot),
    started: false,
    ended: false,
    timer: null,
    stopBot: null,
    startedAt: null,
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

// One match_end event per human player
function trackMatchEnd(room, reason, resultFor) {
  const duration = room.startedAt ? Date.now() - room.startedAt : 0;
  Object.entries(room.players).forEach(([id, p]) => {
    if (p.isBot) return;
    const oppId = getOpponent(room, id);
    analytics.track('match_end', p.playerId, {
      vsBot: room.vsBot, reason, result: resultFor(id), durationMs: duration,
      hp: room.hp[id], oppHp: room.hp[oppId], launches: room.launches[id],
    });
  });
}

function endMatch(roomId, winnerId, reason) {
  const room = rooms[roomId];
  if (!room || room.ended) return;
  room.ended = true;
  clearInterval(room.timer);
  if (room.stopBot) room.stopBot();
  io.to(roomId).emit('gameOver', { winnerId, hp: room.hp });
  trackMatchEnd(room, reason, id => (winnerId === null ? 'draw' : winnerId === id ? 'win' : 'lose'));
}

function startCountdown(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  room.started = true;
  room.startedAt = Date.now();

  room.timer = setInterval(() => {
    room.timeLeft--;
    io.to(roomId).emit('tick', { timeLeft: room.timeLeft });

    if (room.timeLeft <= 0) {
      const [id1, id2] = Object.keys(room.players);
      const hp1 = room.hp[id1];
      const hp2 = room.hp[id2];
      let winnerId = null;
      if (hp1 > hp2) winnerId = id1;
      else if (hp2 > hp1) winnerId = id2;
      // tie → winnerId stays null
      endMatch(roomId, winnerId, 'time');
    }
  }, 1000);
}

// Victim reports damage (item reached their base)
function applyBaseDamage(roomId, victimId, damage) {
  const room = rooms[roomId];
  if (!room || room.ended || room.hp[victimId] === undefined) return;

  room.hp[victimId] = Math.max(0, room.hp[victimId] - damage);

  const opponentId = getOpponent(room, victimId);

  // Tell victim their new HP
  room.players[victimId].emit('hpUpdate', { hp: room.hp[victimId] });
  // Tell attacker (opponent) their attack landed
  if (room.players[opponentId]) {
    room.players[opponentId].emit('opponentHp', { hp: room.hp[victimId] });
  }

  if (room.hp[victimId] <= 0) endMatch(roomId, opponentId, 'ko');
}

function startBot(roomId, bot) {
  const room = rooms[roomId];
  const humanId = getOpponent(room, bot.id);
  room.stopBot = runBot({
    bot,
    emitToOpponent: (ev, data) => { const h = room.players[humanId]; if (h) h.emit(ev, data); },
    reportDamage: dmg => applyBaseDamage(roomId, bot.id, dmg),
    isActive: () => rooms[roomId] === room && !room.ended,
    onLaunch: () => { room.launches[bot.id]++; },
  });
}

// p1 waited longer; p2 just joined (or is a bot)
function startMatch(p1, p2) {
  const roomId = makeRoom(p1, p2);
  const room = rooms[roomId];

  [p1, p2].forEach(p => {
    clearTimeout(p.botTimer);
    p.join(roomId);
    p.roomId = roomId;
  });

  // each player always sees themselves at the bottom
  p1.emit('matched', { roomId, opponentName: p2.playerName, myName: p1.playerName, side: 'bottom', isBot: !!p2.isBot });
  p2.emit('matched', { roomId, opponentName: p1.playerName, myName: p2.playerName, side: 'bottom', isBot: !!p1.isBot });

  [p1, p2].forEach(p => {
    if (!p.isBot) analytics.track('match_start', p.playerId, { vsBot: room.vsBot, waitMs: Date.now() - p.queuedAt });
  });

  // 3-second countdown then start
  let count = 3;
  const cd = setInterval(() => {
    if (rooms[roomId] !== room) { clearInterval(cd); return; }
    io.to(roomId).emit('countdown', { count });
    count--;
    if (count < 0) {
      clearInterval(cd);
      io.to(roomId).emit('gameStart', { timeLeft: 180 });
      startCountdown(roomId);
      const bot = [p1, p2].find(p => p.isBot);
      if (bot) startBot(roomId, bot);
    }
  }, 1000);
}

// ── Connection ─────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[+] ${socket.id} connected`);

  // ── Join / Matchmaking ─────────────────────────────────────────────────
  socket.on('join', ({ playerName, playerId, source, lastVsBot } = {}) => {
    if (waitingQueue.includes(socket) || socket.roomId) return;
    socket.playerName = String(playerName || 'Jugador').slice(0, 16);
    socket.playerId = typeof playerId === 'string' && playerId ? playerId.slice(0, 64) : socket.id;
    socket.queuedAt = Date.now();
    const isRematch = source === 'rematch';
    analytics.track('queue_join', socket.playerId, { source: isRematch ? 'rematch' : 'menu' });

    // Match with the first opponent that is still connected
    while (waitingQueue.length > 0) {
      const opponent = waitingQueue.shift();
      if (opponent.connected) {
        startMatch(opponent, socket);
        return;
      }
    }

    const botInMs = isRematch && lastVsBot ? BOT_REMATCH_WAIT_MS : BOT_WAIT_MS;
    waitingQueue.push(socket);
    socket.emit('waiting', { botInMs });

    // Nobody showed up → play against a bot
    socket.botTimer = setTimeout(() => {
      const qi = waitingQueue.indexOf(socket);
      if (qi === -1 || !socket.connected) return;
      waitingQueue.splice(qi, 1);
      startMatch(socket, createBot());
    }, botInMs);
  });

  // ── Game Events ────────────────────────────────────────────────────────

  // Player launches an item in a lane
  socket.on('launch', (data) => {
    // data: { roomId, lane, itemType, itemId, launchTime }
    const entry = getRoomOf(socket.id);
    if (!entry) return;
    const [, room] = entry;
    if (room.ended) return;
    room.launches[socket.id]++;

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
    applyBaseDamage(roomId, socket.id, damage);
  });

  // ── Disconnect ─────────────────────────────────────────────────────────
  socket.on('disconnect', (reason) => {
    console.log(`[-] ${socket.id} disconnected`);
    clearTimeout(socket.botTimer);

    // Remove from queue
    const qi = waitingQueue.indexOf(socket);
    if (qi !== -1) {
      waitingQueue.splice(qi, 1);
      analytics.track('queue_leave', socket.playerId, { waitMs: Date.now() - socket.queuedAt, reason });
    }

    // Notify room partner
    const entry = getRoomOf(socket.id);
    if (entry) {
      const [roomId, room] = entry;
      if (!room.ended) {
        room.ended = true;
        clearInterval(room.timer);
        if (room.stopBot) room.stopBot();
        socket.to(roomId).emit('opponentDisconnected');
        trackMatchEnd(room, 'disconnect', id => (id === socket.id ? 'quit' : 'win'));
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
