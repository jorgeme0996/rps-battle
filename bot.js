// ═══════════════════════════════════════════════════════════════════════════
//  FALLBACK BOT  –  plays when nobody else is in the queue
//  It simulates the field in its own frame of reference with the same rules
//  as public/game.js, so it can report damage to itself like a real client.
// ═══════════════════════════════════════════════════════════════════════════

const TYPES = ['rock', 'paper', 'scissors'];
const COUNTER = { scissors: 'rock', paper: 'scissors', rock: 'paper' }; // type that beats key
const BEATS = { rock: 'scissors', scissors: 'paper', paper: 'rock' };

// Field geometry mirrored from public/game.js
const ITEM_SPEED = 110;
const SPAWN_DELAY = 200;
const HIT_DIST = 24 * 1.8;
const MY_START = 512, OPP_START = 108;   // spawn y of own / enemy items
const MY_END = 56, OPP_END = 564;       // y where an item hits a base
const DAMAGE = 10;
const CRAFT_STEP_MS = 2500;

// Personality — tune difficulty here
const REACT_MS = [500, 1200];     // time to notice an incoming item
const MISTAKE_RATE = 0.25;        // chance to ignore a threat it could counter
const STEP_PAUSE_MS = [250, 900]; // "tap" delay between craft steps
const MAX_PER_TYPE = 2;
const ATTACK_EVERY_MS = [2500, 5500];

const NAMES = ['Lucía', 'Mateo', 'Sofía', 'Diego', 'Valen', 'Emi', 'Camila', 'Leo', 'Regina', 'Santi', 'Ximena', 'Bruno'];

const rand = ([a, b]) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

function createBot() {
  return {
    id: `bot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    isBot: true,
    connected: true,
    playerName: `Bot ${pick(NAMES)}`,
    join() {},
    emit() {}, // replaced by runBot once the match starts
  };
}

// opts: { bot, emitToOpponent(ev, data), reportDamage(dmg), isActive(), onLaunch() }
function runBot({ bot, emitToOpponent, reportDamage, isActive, onLaunch }) {
  const mine = [];
  const opp = [];
  const inv = { rock: 0, paper: 0, scissors: 0 };
  const recent = [];
  let craft = null; // { type, step, endsAt }
  let nextCraftAt = Date.now() + rand([300, 900]);
  let nextAttackAt = Date.now() + rand([4000, 6000]);
  let counter = 0;
  let last = Date.now();

  bot.emit = (ev, d) => {
    if (ev !== 'opponentLaunch') return;
    const now = Date.now();
    opp.push({ type: d.itemType, lane: d.lane, y: OPP_START, readyAt: now + SPAWN_DELAY, reactAt: now + rand(REACT_MS), handled: false });
    recent.push(d.itemType);
    if (recent.length > 4) recent.shift();
  };

  const launch = (type, lane, now) => {
    inv[type]--;
    mine.push({ type, lane, y: MY_START, readyAt: now + SPAWN_DELAY });
    emitToOpponent('opponentLaunch', { lane, itemType: type, itemId: `${bot.id}_${++counter}`, launchTime: now });
    onLaunch();
  };

  const chooseCraft = () => {
    const open = TYPES.filter(t => inv[t] < MAX_PER_TYPE);
    if (!open.length) return null;
    if (recent.length && Math.random() < 0.55) {
      const counts = {};
      recent.forEach(t => { counts[t] = (counts[t] || 0) + 1; });
      const common = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
      if (open.includes(COUNTER[common])) return COUNTER[common];
    }
    return open.sort((a, b) => inv[a] - inv[b] || Math.random() - 0.5)[0];
  };

  const collide = () => {
    for (let i = mine.length - 1; i >= 0; i--) {
      for (let j = opp.length - 1; j >= 0; j--) {
        const m = mine[i], o = opp[j];
        if (m.lane !== o.lane || Math.abs(m.y - o.y) >= HIT_DIST) continue;
        if (BEATS[m.type] === o.type) opp.splice(j, 1);
        else if (BEATS[o.type] === m.type) mine.splice(i, 1);
        else { mine.splice(i, 1); opp.splice(j, 1); }
        return; // one collision per tick, like the client
      }
    }
  };

  const timer = setInterval(() => {
    if (!isActive()) { clearInterval(timer); return; }
    const now = Date.now();
    const dt = (now - last) / 1000;
    last = now;

    // ── Simulation ─────────────────────────────────────────────────────────
    mine.forEach(it => { if (now >= it.readyAt) it.y -= ITEM_SPEED * dt; });
    opp.forEach(it => { if (now >= it.readyAt) it.y += ITEM_SPEED * dt; });
    collide();
    for (let i = mine.length - 1; i >= 0; i--) if (mine[i].y < MY_END) mine.splice(i, 1);
    for (let i = opp.length - 1; i >= 0; i--) {
      if (opp[i].y > OPP_END) {
        opp.splice(i, 1);
        reportDamage(DAMAGE);
        if (!isActive()) return;
      }
    }

    // ── Crafting (one item at a time, like a single pair of thumbs) ───────
    if (craft && now >= craft.endsAt) {
      craft.step++;
      if (craft.step >= 2) {
        inv[craft.type]++;
        craft = null;
        nextCraftAt = now + rand(STEP_PAUSE_MS);
      } else {
        craft.endsAt = now + rand(STEP_PAUSE_MS) + CRAFT_STEP_MS;
      }
    }
    if (!craft && now >= nextCraftAt) {
      const type = chooseCraft();
      if (type) craft = { type, step: 0, endsAt: now + CRAFT_STEP_MS };
      else nextCraftAt = now + 1000;
    }

    // ── Defense ────────────────────────────────────────────────────────────
    for (const threat of opp) {
      if (threat.handled || now < threat.reactAt) continue;
      threat.handled = true;
      if (threat.y > 440) continue; // too late to intercept
      if (Math.random() < MISTAKE_RATE) continue;
      const c = COUNTER[threat.type];
      if (inv[c] > 0) launch(c, threat.lane, now);
      else if (inv[threat.type] > 0 && Math.random() < 0.5) launch(threat.type, threat.lane, now); // trade 1-for-1
    }

    // ── Offense (keeps one item in reserve to defend) ────────────────────────
    const total = inv.rock + inv.paper + inv.scissors;
    if ((total >= 2 && now >= nextAttackAt) || total >= 4) {
      const type = TYPES.filter(t => inv[t] > 0).sort((a, b) => inv[b] - inv[a])[0];
      launch(type, pick([0, 1, 2]), now);
      nextAttackAt = now + rand(ATTACK_EVERY_MS);
    }
  }, 50);

  return () => clearInterval(timer);
}

module.exports = { createBot, runBot };
