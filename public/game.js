// ═══════════════════════════════════════════════════════════════════════════
//  RPS BATTLE  –  Phaser 3 + Socket.io
//  Diseño portrait mobile (390 × 844)
// ═══════════════════════════════════════════════════════════════════════════

// ── Config ─────────────────────────────────────────────────────────────────
const W = 390, H = 844;
const HUD_H = 80;
const FIELD_H = 460;
const CRAFT_H = H - HUD_H - FIELD_H; // 304
const FIELD_TOP = HUD_H;
const FIELD_BOT = HUD_H + FIELD_H;

const LANES = 3;
const LANE_W = W / LANES;           // 130
const LANE_X = [65, 195, 325];      // centre x of each lane

const ITEM_SPEED = 110;             // px/s  (one-way)
const ITEM_RADIUS = 24;
const DAMAGE = 10;
const MAX_HP = 100;
const GAME_TIME = 180;

const CRAFT_STEPS = 2;
const CRAFT_STEP_DURATION = 2500;   // ms per step

// RPS rules
const BEATS = { rock: 'scissors', scissors: 'paper', paper: 'rock' };
const TYPES = ['rock', 'paper', 'scissors'];

// Craft step labels
const CRAFT_LABELS = {
  rock:     ['Picar piedra', 'Pulir'],
  paper:    ['Sembrar árbol', 'Cortar'],
  scissors: ['Picar metal', 'Afilar'],
};

const NAMES = { rock: 'PIEDRA', paper: 'PAPEL', scissors: 'TIJERA' };

// Debris colour of each item when it breaks
const ITEM_TINT = { rock: 0xa8a29e, paper: 0xfff3d6, scissors: 0xc9d6e3 };

// ── Render resolution ──────────────────────────────────────────────────────
// The world is laid out in 390×844 units, but the canvas is rendered at RES×
// that size and every camera is zoomed by RES, so shapes and text stay crisp
// on retina screens. Canvas textures are drawn at RES too (see canvasTex).
const RES = (() => {
  const dpr = window.devicePixelRatio || 1;
  const fit = Math.min(window.innerWidth / W, window.innerHeight / H);
  return Phaser.Math.Clamp(Math.ceil(fit * dpr * 2) / 2, 1, 3);
})();
const INV = 1 / RES;

// ── Theme ──────────────────────────────────────────────────────────────────
const C = {
  bgDeep: 0x0c0a1f, panel: 0x1f1a42, panelHi: 0x2c2566, line: 0x3a3370,
  ink: 0x1a1433,
  me: 0x2ee6c5,    meHex: '#2ee6c5',
  enemy: 0xff5470, enemyHex: '#ff5470',
  gold: 0xffc93c,  goldHex: '#ffc93c',
  amber: 0xff9f1c,
  text: '#fff7ea', muted: '#a59fd0', dim: '#6b64a3',
};
const INK = '#1a1433';
const FONT_D = '"Lilita One", "Arial Black", sans-serif';
const FONT_B = '"Nunito", "Arial Rounded MT Bold", sans-serif';

const BTN = {
  green:  [0x3ddc84, 0x1f9d57],
  red:    [0xff5470, 0xb8283f],
  blue:   [0x5b8cff, 0x3456c4],
  purple: [0x8b6cff, 0x5a3fd0],
};

const TIPS = [
  'La piedra rompe la tijera',
  'La tijera corta el papel',
  'El papel envuelve la piedra',
  'Craftea mientras tus objetos viajan: ¡no pares!',
  'Defiende tu carril con el objeto que vence al rival',
  'Dos objetos iguales se destruyen entre sí',
  'Cada objeto que llega a la base enemiga quita 10 HP',
  'Si se acaba el tiempo, gana quien tenga más vida',
];

// Shared socket reference (set before GameScene starts)
let socket = null;
let roomId  = null;

// Game server. Empty = same origin; the CrazyGames build sets window.RPS_SERVER
const SERVER_URL = window.RPS_SERVER || '';

// Invite code this page was opened with (?room=CODE or a CrazyGames invite)
let pendingInvite = null;
let instantMultiplayerUsed = false;
let phaserGame = null;

// ═══════════════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════════════
const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
};

const hex = n => '#' + n.toString(16).padStart(6, '0');

// Anonymous, per-device id used only for analytics
const PLAYER_ID = (() => {
  let id = store.get('rps_pid');
  if (!id) {
    id = window.crypto && crypto.randomUUID
      ? crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).slice(2);
    store.set('rps_pid', id);
  }
  return id;
})();

function track(event, props = {}) {
  try {
    const body = JSON.stringify({ event, playerId: PLAYER_ID, props });
    // text/plain keeps it a "simple" request, so it also works cross-origin
    const url = `${SERVER_URL}/api/event`;
    const blob = new Blob([body], { type: 'text/plain' });
    if (!(navigator.sendBeacon && navigator.sendBeacon(url, blob))) {
      fetch(url, { method: 'POST', body: blob, keepalive: true, mode: 'no-cors' }).catch(() => {});
    }
  } catch (e) { /* analytics must never break the game */ }
}

function buzz(ms) {
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* unsupported */ }
}

function setupCamera(scene) {
  const cam = scene.cameras.main;
  cam.setZoom(RES);
  cam.centerOn(W / 2, H / 2);
}

// Body text
function T(scene, x, y, str, style = {}) {
  const s = Object.assign({ fontFamily: FONT_B, fontSize: '16px', color: C.text }, style);
  return scene.add.text(x, y, str, s).setResolution(RES);
}

// Display (cartoon) text, centred, with ink outline
function D(scene, x, y, str, size, color = C.text, extra = {}) {
  return T(scene, x, y, str, Object.assign({
    fontFamily: FONT_D, fontSize: `${size}px`, color,
    stroke: INK, strokeThickness: Math.max(3, Math.round(size / 6)),
    padding: { x: 6, y: 4 },
  }, extra)).setOrigin(0.5);
}

// Image from a canvas texture; `px` = desired on-screen width in world units
const TEX_RES = {};
function img(scene, x, y, key, px) {
  const i = scene.add.image(x, y, key);
  i.setScale(px ? px / i.width : 1 / (TEX_RES[key] || 1));
  return i;
}

function makeButton(scene, x, y, w, h, label, colors, onClick, size = 26) {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  const t = D(scene, 0, 0, label, size, C.text, { strokeThickness: 6 });
  c.add([g, t]);
  let pal = colors, pressed = false;
  const r = Math.min(18, h / 2);
  const draw = () => {
    const off = pressed ? 4 : 0;
    g.clear();
    g.fillStyle(C.ink, 1).fillRoundedRect(-w / 2 - 3, -h / 2 + off - 3, w + 6, h + 11 - off, r + 3);
    g.fillStyle(pal[1], 1).fillRoundedRect(-w / 2, -h / 2 + 5, w, h, r);
    g.fillStyle(pal[0], 1).fillRoundedRect(-w / 2, -h / 2 + off, w, h, r);
    g.fillStyle(0xffffff, 0.22).fillRoundedRect(-w / 2 + 8, -h / 2 + off + 5, w - 16, h * 0.32, h * 0.16);
    t.y = off - 1;
  };
  draw();
  c.setSize(w, h + 8).setInteractive({ useHandCursor: true });
  c.on('pointerdown', () => { pressed = true; draw(); });
  c.on('pointerout',  () => { pressed = false; draw(); });
  c.on('pointerup',   () => { if (!pressed) return; pressed = false; draw(); onClick(); });
  c.restyle = (label2, colors2) => {
    if (label2) t.setText(label2);
    if (colors2) pal = colors2;
    draw();
  };
  return c;
}

function addMuteButton(scene, x, y) {
  const c = scene.add.container(x, y).setDepth(60);
  const g = scene.add.graphics();
  const draw = () => {
    g.clear();
    g.fillStyle(C.panel, 0.9).fillCircle(0, 0, 20);
    g.lineStyle(2, C.line, 1).strokeCircle(0, 0, 20);
    g.fillStyle(0xfff7ea, 1);
    g.fillRect(-10, -4, 5, 8);
    g.fillTriangle(-6, -4, 2, -10, 2, 10);
    g.fillTriangle(-6, -4, 2, 10, -6, 4);
    if (Sfx.muted) {
      g.lineStyle(2.5, C.enemy, 1);
      g.lineBetween(6, -5, 14, 5);
      g.lineBetween(14, -5, 6, 5);
    } else {
      g.lineStyle(2.2, 0xfff7ea, 1);
      g.beginPath(); g.arc(3, 0, 6, -0.9, 0.9); g.strokePath();
      g.beginPath(); g.arc(3, 0, 11, -0.9, 0.9); g.strokePath();
    }
  };
  draw();
  c.add(g);
  c.setSize(44, 44).setInteractive({ useHandCursor: true });
  c.on('pointerup', () => { Sfx.toggle(); draw(); Sfx.play('tap'); });
  return c;
}

function toast(scene, msg, y = H - 120, color = C.gold) {
  const c = scene.add.container(W / 2, y).setDepth(70);
  const t = T(scene, 0, 0, msg, { fontStyle: '900', fontSize: '15px', color: hex(color) }).setOrigin(0.5);
  const w = t.displayWidth + 36, h = 38;
  const g = scene.add.graphics();
  g.fillStyle(C.ink, 0.92).fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
  g.lineStyle(2, color, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);
  c.add([g, t]).setAlpha(0).setScale(0.8);
  scene.tweens.add({ targets: c, alpha: 1, scale: 1, duration: 200, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: c, alpha: 0, delay: 2200, duration: 300, onComplete: () => c.destroy() });
}

// Slowly drifting items behind menus
function addFloaters(scene, n) {
  const list = [];
  for (let i = 0; i < n; i++) {
    const s = img(scene, Phaser.Math.Between(20, W - 20), Phaser.Math.Between(0, H),
      TYPES[i % 3], Phaser.Math.Between(26, 54));
    s.setAlpha(0.08 + Math.random() * 0.08);
    s.rotation = Math.random() * Math.PI * 2;
    s.vy = 10 + Math.random() * 22;
    s.vr = (Math.random() - 0.5) * 0.8;
    list.push(s);
  }
  return list;
}

function updateFloaters(list, dt) {
  list.forEach(s => {
    s.y -= s.vy * dt;
    s.rotation += s.vr * dt;
    if (s.y < -40) { s.y = H + 40; s.x = Phaser.Math.Between(20, W - 20); }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  SOUND  –  tiny WebAudio synth, no audio files needed
// ═══════════════════════════════════════════════════════════════════════════
const Sfx = {
  ctx: null, master: null, noiseBuf: null,
  muted: store.get('rps_muted') === '1',

  unlock() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!this.ctx) {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      const len = Math.floor(this.ctx.sampleRate * 0.6);
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  },

  // Silence everything while a video ad plays
  pause(on) {
    if (!this.ctx) return;
    if (on) this.ctx.suspend(); else this.ctx.resume();
  },

  toggle() {
    this.muted = !this.muted;
    store.set('rps_muted', this.muted ? '1' : '0');
  },

  tone(freq, dur, { type = 'sine', vol = 0.3, slide = null, delay = 0 } = {}) {
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.03);
  },

  noise(dur, { vol = 0.3, freq = 1000, q = 1, delay = 0, slide = null } = {}) {
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(freq, t);
    f.Q.value = q;
    if (slide) f.frequency.exponentialRampToValueAtTime(slide, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.03);
  },

  play(name) {
    if (this.muted || !this.ctx) return;
    switch (name) {
      case 'tap':    this.tone(520, 0.07, { type: 'triangle', vol: 0.18 }); break;
      case 'select': this.tone(660, 0.07, { type: 'triangle', vol: 0.2 });
                     this.tone(990, 0.1, { type: 'triangle', vol: 0.2, delay: 0.05 }); break;
      case 'deny':   this.tone(170, 0.14, { type: 'square', vol: 0.08, slide: 120 }); break;
      case 'work':   this.noise(0.06, { freq: 3200, vol: 0.18, q: 4 }); break;
      case 'step':   this.tone(587, 0.08, { type: 'triangle', vol: 0.2 });
                     this.tone(880, 0.12, { type: 'triangle', vol: 0.2, delay: 0.06 }); break;
      case 'ready':  [523, 659, 784, 1047].forEach((f, i) =>
                       this.tone(f, 0.14, { type: 'triangle', vol: 0.18, delay: i * 0.06 })); break;
      case 'launch': this.tone(260, 0.2, { type: 'sawtooth', vol: 0.06, slide: 900 });
                     this.noise(0.18, { freq: 1500, slide: 4000, vol: 0.12 }); break;
      case 'enemy':  this.tone(300, 0.12, { type: 'square', vol: 0.04, slide: 200 }); break;
      case 'clash':  this.noise(0.22, { freq: 900, vol: 0.4, q: 0.8 });
                     this.tone(160, 0.18, { type: 'square', vol: 0.1, slide: 60 }); break;
      case 'hit':    this.noise(0.3, { freq: 600, vol: 0.35 });
                     this.tone(420, 0.25, { type: 'square', vol: 0.09, slide: 90 });
                     this.tone(1320, 0.1, { type: 'triangle', vol: 0.12, delay: 0.02 }); break;
      case 'hurt':   this.noise(0.35, { freq: 250, vol: 0.5, q: 0.7 });
                     this.tone(120, 0.4, { type: 'sawtooth', vol: 0.16, slide: 38 }); break;
      case 'count':  this.tone(440, 0.16, { type: 'square', vol: 0.08 }); break;
      case 'go':     this.tone(880, 0.4, { type: 'square', vol: 0.09 });
                     this.tone(1320, 0.4, { type: 'triangle', vol: 0.08 }); break;
      case 'tick':   this.tone(1400, 0.04, { vol: 0.1 }); break;
      case 'ko':     this.noise(0.5, { freq: 400, vol: 0.45 });
                     this.tone(200, 0.6, { type: 'sawtooth', vol: 0.12, slide: 50 }); break;
      case 'win':    [523, 659, 784, 1047, 784, 1047].forEach((f, i) =>
                       this.tone(f, 0.18, { type: 'square', vol: 0.07, delay: i * 0.11 })); break;
      case 'lose':   [392, 349, 311, 262].forEach((f, i) =>
                       this.tone(f, 0.28, { type: 'triangle', vol: 0.16, delay: i * 0.18 })); break;
      case 'draw':   [523, 494, 523].forEach((f, i) =>
                       this.tone(f, 0.2, { type: 'triangle', vol: 0.16, delay: i * 0.15 })); break;
    }
  },
};

// Browsers only allow audio after a user gesture
['pointerdown', 'touchend', 'keydown'].forEach(evt =>
  window.addEventListener(evt, () => Sfx.unlock(), { passive: true, capture: true })
);

// ═══════════════════════════════════════════════════════════════════════════
//  CRAZYGAMES SDK  –  every call is a no-op outside CrazyGames
// ═══════════════════════════════════════════════════════════════════════════
const CG = {
  sdk: null,
  enabled: false,
  username: null,
  instantMultiplayer: false,

  async init() {
    const sdk = window.CrazyGames && window.CrazyGames.SDK;
    if (!sdk) return;
    try {
      await sdk.init();
      if (sdk.environment === 'disabled') return;
      this.sdk = sdk;
      this.enabled = true;
      sdk.game.loadingStart();
      this.instantMultiplayer = !!sdk.game.isInstantMultiplayer;
      try {
        const user = await sdk.user.getUser();
        if (user && user.username) this.username = user.username.slice(0, 16);
      } catch (e) { /* not logged in */ }
      sdk.game.addJoinRoomListener(params => {
        if (params && params.room) CG.onJoinRoom(String(params.room));
      });
    } catch (e) {
      console.warn('CrazyGames SDK init failed', e);
    }
  },

  call(fn) {
    if (!this.enabled) return undefined;
    try { return fn(this.sdk); } catch (e) { console.warn('CrazyGames SDK', e); return undefined; }
  },

  loadingStop()    { this.call(s => s.game.loadingStop()); },
  gameplayStart()  { this.call(s => s.game.gameplayStart()); },
  gameplayStop()   { this.call(s => s.game.gameplayStop()); },
  happytime()      { this.call(s => s.game.happytime()); },
  inviteParam(key) { return this.call(s => s.game.getInviteParam(key)) || null; },
  inviteLink(params) { return this.call(s => s.game.inviteLink(params)); },
  showInviteButton(params) { this.call(s => s.game.showInviteButton(params)); },
  hideInviteButton() { this.call(s => s.game.hideInviteButton()); },
  // Room presence (newer SDK builds only)
  updateRoom(opts) { this.call(s => typeof s.game.updateRoom === 'function' && s.game.updateRoom(opts)); },
  leftRoom()       { this.call(s => typeof s.game.leftRoom === 'function' && s.game.leftRoom()); },

  // Resolves when the ad is over (or there was none)
  midgameAd() {
    return new Promise(resolve => {
      if (!this.enabled) { resolve(); return; }
      const done = () => { Sfx.pause(false); resolve(); };
      const requested = this.call(s => {
        s.ad.requestAd('midgame', {
          adStarted: () => Sfx.pause(true),
          adFinished: done,
          adError: done,
        });
        return true;
      });
      if (!requested) done();
    });
  },

  // An invite was accepted while the game is already open
  onJoinRoom(code) {
    const menu = phaserGame && phaserGame.scene.getScene('Menu');
    if (menu && menu.scene.isActive() && !menu.isConnecting) menu.startConnect('join', code);
    else pendingInvite = code;
  },
};

function inviteUrl(code) {
  return CG.inviteLink({ room: code }) || `${location.origin}${location.pathname}?room=${code}`;
}

// ═══════════════════════════════════════════════════════════════════════════
//  CANVAS DRAWING  –  all art is generated here, no image files
// ═══════════════════════════════════════════════════════════════════════════
function canvasTex(scene, key, w, h, draw, res = RES) {
  const tex = scene.textures.createCanvas(key, Math.ceil(w * res), Math.ceil(h * res));
  const ctx = tex.getContext();
  ctx.scale(res, res);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  draw(ctx, w, h);
  tex.refresh();
  TEX_RES[key] = res;
}

const PI2 = Math.PI * 2;

function rrPath(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

// Smooth closed shape through the midpoints of a polygon
function blob(c, pts) {
  const n = pts.length;
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const m = mid(pts[n - 1], pts[0]);
  c.beginPath();
  c.moveTo(m[0], m[1]);
  for (let i = 0; i < n; i++) {
    const p = pts[i], nm = mid(p, pts[(i + 1) % n]);
    c.quadraticCurveTo(p[0], p[1], nm[0], nm[1]);
  }
  c.closePath();
}

function inked(c, fill, lw = 3) {
  c.fillStyle = fill;
  c.fill();
  c.lineWidth = lw;
  c.strokeStyle = INK;
  c.stroke();
}

function star(c, x, y, r, color) {
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(x, y - r);
  c.quadraticCurveTo(x, y, x + r, y);
  c.quadraticCurveTo(x, y, x, y + r);
  c.quadraticCurveTo(x, y, x - r, y);
  c.quadraticCurveTo(x, y, x, y - r);
  c.fill();
}

function line(c, x1, y1, x2, y2, color, lw) {
  c.strokeStyle = color;
  c.lineWidth = lw;
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
}

// Stroke with an ink outline underneath (handles, arms…)
function inkLine(c, x1, y1, x2, y2, color, lw) {
  line(c, x1, y1, x2, y2, INK, lw + 4);
  line(c, x1, y1, x2, y2, color, lw);
}

function shadow(c, x, y, rx, ry) {
  c.fillStyle = 'rgba(0,0,0,.28)';
  c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, PI2); c.fill();
}

function steelGrad(c, x0, x1) {
  const g = c.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, '#f1f5f9');
  g.addColorStop(0.5, '#aebccd');
  g.addColorStop(1, '#eef2f7');
  return g;
}

function drawRock(c) {
  shadow(c, 29, 50, 19, 4.5);
  const pts = [[27, 6], [41, 9], [50, 22], [48, 38], [36, 48], [19, 48], [8, 39], [5, 23], [13, 11]];
  blob(c, pts);
  const g = c.createRadialGradient(20, 16, 2, 28, 28, 30);
  g.addColorStop(0, '#eceae8');
  g.addColorStop(0.45, '#a8a29e');
  g.addColorStop(1, '#6b6560');
  c.fillStyle = g;
  c.fill();
  // facet shade
  c.save();
  blob(c, pts); c.clip();
  c.fillStyle = 'rgba(40,30,60,.22)';
  c.beginPath(); c.moveTo(50, 20); c.lineTo(30, 34); c.lineTo(22, 56); c.lineTo(56, 56); c.closePath(); c.fill();
  c.restore();
  blob(c, pts);
  c.lineWidth = 3.2; c.strokeStyle = INK; c.stroke();
  // cracks
  c.strokeStyle = 'rgba(40,30,60,.55)';
  c.lineWidth = 2;
  c.beginPath(); c.moveTo(41, 11); c.lineTo(36, 18); c.lineTo(40, 23); c.lineTo(35, 31); c.stroke();
  c.beginPath(); c.moveTo(12, 38); c.lineTo(17, 35); c.stroke();
  // shine
  c.fillStyle = 'rgba(255,255,255,.8)';
  c.beginPath(); c.ellipse(18, 17, 5, 3, -0.6, 0, PI2); c.fill();
}

function drawPaper(c) {
  shadow(c, 28, 50, 17, 4.5);
  c.save();
  c.translate(28, 26);
  c.rotate(-0.14);
  c.beginPath();
  c.moveTo(-16, -21); c.lineTo(7, -21); c.lineTo(16, -12); c.lineTo(16, 21); c.lineTo(-16, 21);
  c.closePath();
  const g = c.createLinearGradient(0, -21, 0, 21);
  g.addColorStop(0, '#fffdf7');
  g.addColorStop(1, '#f2dfb6');
  inked(c, g, 3);
  [-8, -1, 6, 13].forEach(y => line(c, -8, y, 10, y, '#8fb3ff', 1.6));
  line(c, -11, -16, -11, 17, '#ff8fa3', 1.4);
  c.beginPath();
  c.moveTo(7, -21); c.lineTo(7, -12); c.lineTo(16, -12);
  c.closePath();
  inked(c, '#e3c98f', 2.2);
  c.restore();
}

function drawScissors(c) {
  shadow(c, 28, 53, 18, 3);
  const ORANGE = '#ff9f1c';
  inkLine(c, 30, 32, 19, 43, ORANGE, 4.5);
  inkLine(c, 26, 32, 37, 43, ORANGE, 4.5);
  [[17, 45], [39, 45]].forEach(([x, y]) => {
    c.beginPath(); c.arc(x, y, 6.5, 0, PI2);
    c.strokeStyle = INK; c.lineWidth = 8.5; c.stroke();
    c.strokeStyle = ORANGE; c.lineWidth = 4; c.stroke();
  });
  const steel = steelGrad(c, 10, 46);
  c.beginPath();
  c.moveTo(15, 3); c.lineTo(31.5, 28); c.lineTo(29.5, 34); c.lineTo(24.5, 31.5);
  c.closePath();
  inked(c, steel, 2.6);
  c.beginPath();
  c.moveTo(41, 3); c.lineTo(24.5, 28); c.lineTo(26.5, 34); c.lineTo(31.5, 31.5);
  c.closePath();
  inked(c, steel, 2.6);
  line(c, 18, 9, 25, 21, 'rgba(255,255,255,.9)', 1.3);
  c.beginPath(); c.arc(28, 30.5, 3.6, 0, PI2);
  inked(c, '#ffd166', 2);
}

// ═══════════════════════════════════════════════════════════════════════════
//  BOOT SCENE  – generates all textures programmatically
// ═══════════════════════════════════════════════════════════════════════════
class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  create() {
    this.generateTextures();
    CG.loadingStop();
    const loader = document.getElementById('loader');
    if (loader) {
      loader.classList.add('hide');
      setTimeout(() => loader.remove(), 400);
    }
    this.scene.start('Menu');
  }

  generateTextures() {
    canvasTex(this, 'rock', 56, 56, drawRock);
    canvasTex(this, 'paper', 56, 56, drawPaper);
    canvasTex(this, 'scissors', 56, 56, drawScissors);
    this.makeCraftIcons();
    this.makeField();
    this.makeFx();
    this.makeScreens();
  }

  makeCraftIcons() {
    // Picar piedra: pickaxe over a rough rock
    canvasTex(this, 'icon_rock_0', 44, 44, c => {
      blob(c, [[6, 30], [12, 23], [22, 24], [28, 32], [24, 40], [9, 41]]);
      inked(c, '#8d8580', 2.5);
      c.fillStyle = 'rgba(255,255,255,.5)';
      c.beginPath(); c.ellipse(12, 28, 3, 2, 0, 0, PI2); c.fill();
      inkLine(c, 14, 40, 33, 12, '#b7773f', 3.5);
      c.beginPath(); c.moveTo(24, 6); c.quadraticCurveTo(36, 8, 42, 18);
      c.strokeStyle = INK; c.lineWidth = 8; c.stroke();
      c.strokeStyle = '#d6dde6'; c.lineWidth = 4; c.stroke();
      star(c, 8, 10, 4.5, '#ffc93c');
      star(c, 38, 32, 3.5, '#ffc93c');
    });
    // Pulir: polished rock with sparkles
    canvasTex(this, 'icon_rock_1', 44, 44, c => {
      c.beginPath(); c.ellipse(21, 26, 15, 13, 0, 0, PI2);
      const g = c.createRadialGradient(15, 19, 1, 21, 26, 17);
      g.addColorStop(0, '#fafaf9'); g.addColorStop(0.5, '#a8a29e'); g.addColorStop(1, '#6b6560');
      inked(c, g, 2.5);
      c.fillStyle = 'rgba(255,255,255,.85)';
      c.beginPath(); c.ellipse(15, 20, 4, 2.5, -0.6, 0, PI2); c.fill();
      star(c, 36, 9, 6.5, '#ffffff');
      star(c, 8, 9, 4, '#ffc93c');
      star(c, 39, 34, 3.5, '#ffffff');
    });
    // Sembrar árbol: tree
    canvasTex(this, 'icon_paper_0', 44, 44, c => {
      c.beginPath(); c.ellipse(22, 39, 15, 4, 0, 0, PI2);
      inked(c, '#7a4a2a', 2);
      rrPath(c, 19, 22, 6, 17, 2);
      inked(c, '#a0673a', 2);
      const circles = [[14, 20, 8], [30, 20, 8], [22, 11, 9]];
      c.fillStyle = INK;
      circles.forEach(([x, y, r]) => { c.beginPath(); c.arc(x, y, r + 2.5, 0, PI2); c.fill(); });
      c.fillStyle = '#4cc15a';
      circles.forEach(([x, y, r]) => { c.beginPath(); c.arc(x, y, r, 0, PI2); c.fill(); });
      c.fillStyle = 'rgba(255,255,255,.35)';
      c.beginPath(); c.arc(19, 9, 3, 0, PI2); c.fill();
    });
    // Cortar: axe
    canvasTex(this, 'icon_paper_1', 44, 44, c => {
      inkLine(c, 12, 40, 30, 10, '#b7773f', 3.5);
      c.beginPath();
      c.moveTo(24, 10); c.lineTo(33, 5);
      c.quadraticCurveTo(44, 14, 38, 27);
      c.lineTo(29, 20);
      c.closePath();
      inked(c, steelGrad(c, 24, 44), 2.5);
      c.fillStyle = '#c98a4b';
      c.fillRect(5, 30, 5, 3);
      c.fillRect(33, 36, 4, 3);
    });
    // Picar metal: ingots
    canvasTex(this, 'icon_scissors_0', 44, 44, c => {
      const ingot = (x, y) => {
        c.beginPath();
        c.moveTo(x - 12, y + 6); c.lineTo(x + 12, y + 6); c.lineTo(x + 8, y - 5); c.lineTo(x - 8, y - 5);
        c.closePath();
        inked(c, steelGrad(c, x - 12, x + 12), 2.4);
        line(c, x - 6, y - 2, x + 6, y - 2, 'rgba(255,255,255,.9)', 1.4);
      };
      ingot(15, 33); ingot(31, 33); ingot(23, 21);
      star(c, 37, 9, 4.5, '#ffffff');
    });
    // Afilar: blade on a whetstone
    canvasTex(this, 'icon_scissors_1', 44, 44, c => {
      rrPath(c, 4, 35, 34, 7, 3);
      inked(c, '#8b6cff', 2.2);
      c.beginPath();
      c.moveTo(8, 33); c.lineTo(39, 5); c.lineTo(16, 36);
      c.closePath();
      inked(c, steelGrad(c, 8, 39), 2.4);
      star(c, 24, 27, 5, '#ffc93c');
      star(c, 32, 33, 3.5, '#ffe28a');
    });

    canvasTex(this, 'lock', 18, 18, c => {
      c.beginPath(); c.arc(9, 8, 4.5, Math.PI, 0);
      c.strokeStyle = INK; c.lineWidth = 5; c.stroke();
      c.strokeStyle = '#8a84b8'; c.lineWidth = 2.2; c.stroke();
      rrPath(c, 3, 8, 12, 9, 2.5);
      inked(c, '#8a84b8', 2);
    });
    canvasTex(this, 'check', 18, 18, c => {
      c.beginPath(); c.arc(9, 9, 7.5, 0, PI2);
      inked(c, '#2ee6c5', 2);
      c.beginPath(); c.moveTo(5.5, 9.5); c.lineTo(8, 12); c.lineTo(12.5, 6.5);
      c.strokeStyle = INK; c.lineWidth = 2.4; c.stroke();
    });
  }

  makeField() {
    canvasTex(this, 'field_bg', W, FIELD_H, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#3a1838');
      g.addColorStop(0.42, '#1c1636');
      g.addColorStop(0.58, '#15203a');
      g.addColorStop(1, '#0f3036');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      c.fillStyle = 'rgba(255,255,255,.025)';
      c.fillRect(LANE_W, 0, LANE_W, h);
      line(c, LANE_W, 0, LANE_W, h, 'rgba(255,255,255,.07)', 2);
      line(c, LANE_W * 2, 0, LANE_W * 2, h, 'rgba(255,255,255,.07)', 2);
      c.fillStyle = 'rgba(255,255,255,.06)';
      for (let y = 20; y < h; y += 22) {
        LANE_X.forEach(x => { c.beginPath(); c.arc(x, y, 2, 0, PI2); c.fill(); });
      }
      c.setLineDash([10, 8]);
      line(c, 0, h / 2, w, h / 2, 'rgba(255,255,255,.2)', 2);
      c.setLineDash([]);
      c.save();
      c.translate(w / 2, h / 2);
      c.rotate(Math.PI / 4);
      rrPath(c, -8, -8, 16, 16, 3);
      c.fillStyle = '#1c1636'; c.fill();
      c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 2; c.stroke();
      c.restore();
    });

    const wall = (key, top, bottom, flip) => canvasTex(this, key, W, 34, (c, w) => {
      if (flip) { c.translate(0, 34); c.scale(1, -1); }
      const pts = [[0, 0], [w, 0], [w, 30]];
      let x = w;
      while (x > 0) {
        const x1 = Math.max(0, x - 14);
        pts.push([x1, 30]);
        if (x1 <= 0) break;
        pts.push([x1, 20]);
        const x2 = Math.max(0, x1 - 12);
        pts.push([x2, 20]);
        if (x2 <= 0) break;
        pts.push([x2, 30]);
        x = x2;
      }
      c.beginPath();
      pts.forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py)));
      c.closePath();
      const g = c.createLinearGradient(0, 0, 0, 30);
      g.addColorStop(0, top);
      g.addColorStop(1, bottom);
      inked(c, g, 3);
      c.save();
      c.clip();
      line(c, 0, 10, w, 10, 'rgba(0,0,0,.2)', 1.5);
      for (let bx = 13; bx < w; bx += 26) line(c, bx, 0, bx, 10, 'rgba(0,0,0,.2)', 1.5);
      for (let bx = 0; bx < w; bx += 26) line(c, bx, 10, bx, 20, 'rgba(0,0,0,.2)', 1.5);
      line(c, 0, 26, w, 26, 'rgba(255,255,255,.18)', 2);
      c.restore();
    });
    wall('wall_enemy', '#8f2440', '#e0445f', false);
    wall('wall_me', '#137a69', '#22c7a9', true);

    canvasTex(this, 'chev', 22, 12, c => {
      c.beginPath(); c.moveTo(3, 10); c.lineTo(11, 3); c.lineTo(19, 10);
      c.strokeStyle = '#ffffff'; c.lineWidth = 3.5; c.stroke();
    });
  }

  makeFx() {
    canvasTex(this, 'glow', 64, 64, c => {
      const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.4, 'rgba(255,255,255,.45)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 64, 64);
    }, 1);
    canvasTex(this, 'dot', 12, 12, c => {
      const g = c.createRadialGradient(6, 6, 0, 6, 6, 6);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 12, 12);
    });
    canvasTex(this, 'spark', 16, 16, c => star(c, 8, 8, 7.5, '#ffffff'));
    canvasTex(this, 'chunk', 10, 10, c => { rrPath(c, 1, 1, 8, 8, 2); c.fillStyle = '#ffffff'; c.fill(); });
    canvasTex(this, 'confetti', 10, 6, c => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, 10, 6); });
    canvasTex(this, 'ring', 64, 64, c => {
      c.beginPath(); c.arc(32, 32, 28, 0, PI2);
      c.strokeStyle = '#ffffff'; c.lineWidth = 4; c.stroke();
    });
    canvasTex(this, 'vignette', W, H, (c, w, h) => {
      const g = c.createRadialGradient(w / 2, h / 2, h * 0.28, w / 2, h / 2, h * 0.62);
      g.addColorStop(0, 'rgba(255,40,80,0)');
      g.addColorStop(1, 'rgba(255,40,80,.85)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    }, 0.5);
  }

  makeScreens() {
    canvasTex(this, 'menu_bg', W, H, (c, w, h) => {
      const g = c.createRadialGradient(w / 2, h * 0.2, 20, w / 2, h * 0.45, h * 0.8);
      g.addColorStop(0, '#2d2468');
      g.addColorStop(0.5, '#14112b');
      g.addColorStop(1, '#0c0a1f');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    }, 1);

    canvasTex(this, 'rays', 320, 320, c => {
      const n = 14;
      const g = c.createRadialGradient(160, 160, 10, 160, 160, 160);
      g.addColorStop(0, 'rgba(255,201,60,.45)');
      g.addColorStop(1, 'rgba(255,201,60,0)');
      c.fillStyle = g;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * PI2;
        c.beginPath();
        c.moveTo(160, 160);
        c.arc(160, 160, 160, a, a + PI2 / n / 2);
        c.closePath();
        c.fill();
      }
    }, 1);

    canvasTex(this, 'trophy', 96, 96, c => {
      const gold = c.createLinearGradient(26, 0, 70, 0);
      gold.addColorStop(0, '#fff1a8');
      gold.addColorStop(0.5, '#ffc93c');
      gold.addColorStop(1, '#e09a00');
      c.beginPath(); c.arc(26, 28, 11, Math.PI * 0.5, Math.PI * 1.5);
      c.strokeStyle = INK; c.lineWidth = 9; c.stroke();
      c.strokeStyle = '#ffc93c'; c.lineWidth = 4.5; c.stroke();
      c.beginPath(); c.arc(70, 28, 11, -Math.PI * 0.5, Math.PI * 0.5);
      c.strokeStyle = INK; c.lineWidth = 9; c.stroke();
      c.strokeStyle = '#ffc93c'; c.lineWidth = 4.5; c.stroke();
      rrPath(c, 42, 56, 12, 14, 2);
      inked(c, gold, 3);
      c.beginPath();
      c.moveTo(24, 14); c.lineTo(72, 14);
      c.quadraticCurveTo(72, 54, 48, 60);
      c.quadraticCurveTo(24, 54, 24, 14);
      c.closePath();
      inked(c, gold, 3.5);
      rrPath(c, 28, 68, 40, 14, 4);
      inked(c, '#8b6cff', 3);
      c.fillStyle = 'rgba(255,255,255,.6)';
      c.beginPath(); c.ellipse(34, 28, 3.5, 9, 0, 0, PI2); c.fill();
      star(c, 50, 32, 8, '#fff8d6');
    });

    canvasTex(this, 'heart_broken', 96, 96, c => {
      const heart = () => {
        const cx = 48, cy = 50, s = 30;
        c.beginPath();
        c.moveTo(cx, cy + s * 0.9);
        c.bezierCurveTo(cx - s * 1.4, cy + s * 0.1, cx - s * 0.9, cy - s * 1.0, cx, cy - s * 0.35);
        c.bezierCurveTo(cx + s * 0.9, cy - s * 1.0, cx + s * 1.4, cy + s * 0.1, cx, cy + s * 0.9);
        c.closePath();
      };
      const zig = [[48, 18], [43, 32], [53, 44], [44, 56], [52, 68], [48, 86]];
      [-1, 1].forEach(side => {
        c.save();
        c.translate(48 + side * 5, 50);
        c.rotate(side * 0.08);
        c.translate(-48, -50);
        c.beginPath();
        const edge = side < 0 ? 0 : 96;
        c.moveTo(edge, 0);
        zig.forEach(p => c.lineTo(p[0], p[1]));
        c.lineTo(48, 96); c.lineTo(edge, 96);
        c.closePath();
        c.clip();
        heart();
        const g = c.createLinearGradient(0, 20, 0, 80);
        g.addColorStop(0, '#ff8aa0');
        g.addColorStop(1, '#d42c4b');
        inked(c, g, 3.5);
        c.beginPath();
        zig.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
        c.strokeStyle = INK; c.lineWidth = 3.5; c.stroke();
        c.restore();
      });
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  MENU SCENE  –  Enter name → connect → waiting room
// ═══════════════════════════════════════════════════════════════════════════
class MenuScene extends Phaser.Scene {
  constructor() { super('Menu'); }

  init(data) {
    this.autoStart = !!(data && data.autoStart);
    this.lastVsBot = !!(data && data.lastVsBot);
    this.notice = (data && data.notice) || '';
    this.isConnecting = false;
  }

  create() {
    setupCamera(this);
    img(this, W / 2, H / 2, 'menu_bg');
    this.floaters = addFloaters(this, 12);

    this.buildLogo();
    this.buildForm();
    this.buildRulesCard();
    this.buildSearchCard();
    addMuteButton(this, W - 32, 34);
    T(this, W / 2, H - 16, 'v1.0', { fontSize: '11px', color: C.dim }).setOrigin(0.5);

    this.events.once('shutdown', () => this.cleanup());

    if (this.notice) toast(this, this.notice, H - 60, C.enemy);
    if (pendingInvite) {
      // Opened from an invite: go straight into the friend's room, no onboarding
      const code = pendingInvite;
      pendingInvite = null;
      this.time.delayedCall(250, () => this.startConnect('join', code));
    } else if (CG.instantMultiplayer && !instantMultiplayerUsed) {
      instantMultiplayerUsed = true;
      this.time.delayedCall(250, () => this.startConnect('host'));
    } else if (this.autoStart) this.time.delayedCall(250, () => this.startConnect());
    else if (!store.get('rps_tutorial_seen')) this.time.delayedCall(900, () => this.showTutorial(true));
  }

  update(time, delta) {
    updateFloaters(this.floaters, delta / 1000);
    if (this.spinner && this.spinner.visible) {
      this.spinner.rotation += delta * 0.003;
      this.spinner.list.forEach(s => { s.rotation = -this.spinner.rotation; });
    }
  }

  // ── Layout ────────────────────────────────────────────────────────────────
  buildLogo() {
    [['rock', W / 2 - 112, 84, -0.2], ['paper', W / 2, 62, 0], ['scissors', W / 2 + 112, 84, 0.2]]
      .forEach(([key, x, y, rot], i) => {
        const s = img(this, x, y - 30, key, 62).setAlpha(0).setRotation(rot);
        this.tweens.add({ targets: s, y, alpha: 1, duration: 500, delay: 250 + i * 120, ease: 'Back.easeOut' });
        this.tweens.add({
          targets: s, y: y - 8, rotation: rot + 0.12, duration: 1100 + i * 150,
          yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: 800 + i * 120,
        });
      });

    const title = D(this, W / 2, 150, 'RPS', 104, C.goldHex, { strokeThickness: 14 })
      .setShadow(0, 7, '#000000', 0, true, true)
      .setScale(0);
    this.tweens.add({ targets: title, scale: 1, duration: 600, ease: 'Back.easeOut' });

    const ribbon = this.add.container(W / 2, 222).setAngle(-3).setScale(0);
    const rg = this.add.graphics();
    rg.fillStyle(C.ink, 1);
    rg.fillTriangle(-150, -16, -112, -16, -112, 26);
    rg.fillTriangle(-150, 26, -112, 26, -130, 5);
    rg.fillTriangle(150, -16, 112, -16, 112, 26);
    rg.fillTriangle(150, 26, 112, 26, 130, 5);
    rg.fillStyle(0xb8283f, 1);
    rg.fillTriangle(-145, -12, -112, -12, -112, 22);
    rg.fillTriangle(-145, 22, -112, 22, -128, 5);
    rg.fillTriangle(145, -12, 112, -12, 112, 22);
    rg.fillTriangle(145, 22, 112, 22, 128, 5);
    rg.fillStyle(C.ink, 1).fillRoundedRect(-118, -27, 236, 50, 10);
    rg.fillStyle(C.enemy, 1).fillRoundedRect(-115, -24, 230, 44, 8);
    rg.fillStyle(0xffffff, 0.2).fillRoundedRect(-108, -20, 216, 12, 6);
    ribbon.add([rg, D(this, 0, -2, 'BATTLE', 34, C.text, { strokeThickness: 6 })]);
    this.tweens.add({ targets: ribbon, scale: 1, duration: 500, delay: 200, ease: 'Back.easeOut' });

    const sub = T(this, W / 2, 274, 'Craftea · Lanza · Destruye', {
      fontStyle: '800', fontSize: '15px', color: C.muted,
    }).setOrigin(0.5).setAlpha(0);
    this.tweens.add({ targets: sub, alpha: 1, duration: 400, delay: 500 });
  }

  buildForm() {
    T(this, W / 2, 320, 'TU NOMBRE', { fontStyle: '900', fontSize: '13px', color: C.muted }).setOrigin(0.5);

    // Plain HTML input laid over the canvas (Phaser DOM ignores camera zoom)
    const inputEl = document.getElementById('nameInput');
    this.nameInput = {
      setVisible: (on) => { inputEl.style.display = on ? 'block' : 'none'; },
    };
    const place = () => {
      const r = this.game.canvas.getBoundingClientRect();
      const k = r.width / W;
      inputEl.style.left = `${r.left + (W / 2) * k}px`;
      inputEl.style.top = `${r.top + 360 * k}px`;
      inputEl.style.transform = `translate(-50%, -50%) scale(${k})`;
    };
    place();
    this.nameInput.setVisible(true);
    // Wait a frame so Phaser has refitted the canvas first
    const onResize = () => requestAnimationFrame(place);
    window.addEventListener('resize', onResize);
    this.events.once('shutdown', () => {
      window.removeEventListener('resize', onResize);
      this.nameInput.setVisible(false);
      inputEl.onkeydown = null;
    });
    // Logged-in CrazyGames players always show their CrazyGames username
    inputEl.value = CG.username || store.get('rps_name', '');
    inputEl.disabled = !!CG.username;
    inputEl.onkeydown = e => {
      if (e.key === 'Enter') { inputEl.blur(); this.startConnect(); }
    };

    this.playBtn = makeButton(this, W / 2, 444, 250, 66, '¡JUGAR!', BTN.green, () => {
      if (this.isConnecting) this.cancelConnect();
      else this.startConnect();
    }, 32);
    this.playPulse = this.tweens.add({
      targets: this.playBtn, scale: 1.05, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    this.friendBtn = makeButton(this, W / 2, 522, 250, 50, 'JUGAR CON AMIGO', BTN.purple, () => {
      if (this.mode === 'host') this.shareInvite();
      else if (!this.isConnecting) this.startConnect('host');
    }, 21);

    const how = T(this, W / 2, 584, '¿Cómo se juega?', {
      fontStyle: '900', fontSize: '16px', color: C.goldHex,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    const ul = this.add.rectangle(W / 2, 597, how.displayWidth, 2, C.gold, 0.6);
    how.on('pointerup', () => { Sfx.play('tap'); this.showTutorial(); });
    this.howLink = [how, ul];
  }

  buildRulesCard() {
    const c = this.add.container(W / 2, 702);
    const g = this.add.graphics();
    g.fillStyle(C.panel, 0.85).fillRoundedRect(-171, -72, 342, 144, 20);
    g.lineStyle(2, C.line, 1).strokeRoundedRect(-171, -72, 342, 144, 20);
    c.add(g);
    c.add(T(this, 0, -50, 'QUIÉN GANA A QUIÉN', { fontStyle: '900', fontSize: '12px', color: C.muted }).setOrigin(0.5));
    ['rock', 'scissors', 'paper', 'rock'].forEach((k, i) => {
      const x = -126 + i * 84;
      const s = img(this, x, -6, k, 50);
      c.add(s);
      this.tweens.add({ targets: s, y: -12, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: i * 150 });
      if (i < 3) c.add(D(this, x + 42, -6, '>', 26, C.goldHex, { strokeThickness: 5 }));
    });
    c.add(T(this, 0, 44, 'Piedra rompe tijera · Tijera corta papel\nPapel envuelve piedra', {
      fontStyle: '700', fontSize: '12px', color: C.muted, align: 'center', lineSpacing: 2,
    }).setOrigin(0.5));
    this.rulesCard = c;
  }

  buildSearchCard() {
    const c = this.add.container(W / 2, 708).setAlpha(0).setVisible(false);
    const g = this.add.graphics();
    g.fillStyle(C.panel, 0.92).fillRoundedRect(-171, -90, 342, 180, 20);
    g.lineStyle(2, C.gold, 0.7).strokeRoundedRect(-171, -90, 342, 180, 20);
    c.add(g);

    this.spinner = this.add.container(0, -42);
    TYPES.forEach((k, i) => {
      const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
      this.spinner.add(img(this, Math.cos(a) * 26, Math.sin(a) * 26, k, 30));
    });
    c.add(this.spinner);

    this.searchStatus = D(this, 0, 16, 'Conectando…', 22, C.text, { strokeThickness: 4 });
    this.searchClock = T(this, 0, 40, '0:00', { fontStyle: '800', fontSize: '13px', color: C.muted }).setOrigin(0.5);
    this.searchTip = T(this, 0, 68, '', {
      fontStyle: '700', fontSize: '13px', color: C.goldHex, align: 'center', wordWrap: { width: 300 },
    }).setOrigin(0.5);
    c.add([this.searchStatus, this.searchClock, this.searchTip]);
    this.searchCard = c;
  }

  showSearch(on) {
    const [inCard, outCard] = on ? [this.searchCard, this.rulesCard] : [this.rulesCard, this.searchCard];
    this.tweens.killTweensOf([inCard, outCard]);
    inCard.setVisible(true);
    this.tweens.add({ targets: inCard, alpha: 1, duration: 200 });
    this.tweens.add({ targets: outCard, alpha: 0, duration: 150, onComplete: () => outCard.setVisible(false) });
    this.howLink.forEach(o => o.setVisible(!on));
    this.friendBtn.setVisible(!on || this.mode === 'host');
  }

  // ── Tutorial ──────────────────────────────────────────────────────────────
  showTutorial(auto = false) {
    if (this.tutorial || this.isConnecting) return;
    track('tutorial_open', { auto });
    store.set('rps_tutorial_seen', '1');
    this.nameInput.setVisible(false);

    const o = this.add.container(0, 0).setDepth(100);
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x0c0a1f, 0.88).setInteractive();
    o.add(dim);

    const card = this.add.container(W / 2, H / 2);
    const g = this.add.graphics();
    g.fillStyle(C.ink, 1).fillRoundedRect(-178, -330, 356, 660, 26);
    g.fillStyle(C.panel, 1).fillRoundedRect(-174, -326, 348, 652, 24);
    card.add(g);
    card.add(D(this, 0, -290, 'CÓMO SE JUEGA', 30, C.goldHex));

    const rows = [
      ['icon_rock_0', '1. CRAFTEA', 'Toca los 2 pasos de cada objeto. Cada paso tarda 2.5 segundos.'],
      ['rock', '2. LANZA', 'Toca tu objeto listo y luego un carril. Viajará hacia la base enemiga.'],
      ['scissors', '3. CHOCA', 'Piedra > Tijera > Papel > Piedra. El que pierde se destruye; si son iguales, ambos.'],
      ['trophy', '4. GANA', 'Cada objeto que llega a su base quita 10 HP. Déjalo en 0 o ten más vida al final.'],
    ];
    rows.forEach(([key, title, body], i) => {
      const y = -210 + i * 118;
      const box = this.add.graphics();
      box.fillStyle(C.panelHi, 1).fillRoundedRect(-156, y - 48, 312, 100, 18);
      card.add(box);
      card.add(img(this, -112, y + 2, key, 58));
      card.add(D(this, -70, y - 24, title, 20, C.text, { strokeThickness: 4 }).setOrigin(0, 0.5));
      card.add(T(this, -70, y + 14, body, {
        fontStyle: '700', fontSize: '13px', color: C.muted, wordWrap: { width: 212 }, lineSpacing: 1,
      }).setOrigin(0, 0.5));
    });

    const ok = makeButton(this, 0, 270, 230, 58, '¡ENTENDIDO!', BTN.green, () => {
      this.tweens.add({
        targets: o, alpha: 0, duration: 180,
        onComplete: () => { o.destroy(); this.tutorial = null; this.nameInput.setVisible(true); },
      });
    }, 26);
    card.add(ok);
    o.add(card);

    o.setAlpha(0);
    card.setScale(0.85);
    this.tweens.add({ targets: o, alpha: 1, duration: 200 });
    this.tweens.add({ targets: card, scale: 1, duration: 300, ease: 'Back.easeOut' });
    this.tutorial = o;
  }

  // ── Matchmaking ───────────────────────────────────────────────────────────
  // mode: 'queue' (random rival), 'host' (private room), 'join' (friend's room)
  startConnect(mode = 'queue', code = null) {
    if (this.isConnecting) return;
    this.mode = mode;
    this.privateCode = code;
    const inputEl = document.getElementById('nameInput');
    const typed = inputEl ? inputEl.value.trim() : '';
    const name = typed || 'Jugador';
    if (!CG.username) store.set('rps_name', typed);
    if (inputEl) { inputEl.blur(); inputEl.disabled = true; }

    Sfx.play('select');
    this.isConnecting = true;
    this.playPulse.pause();
    this.playBtn.setScale(1);
    this.playBtn.restyle('CANCELAR', BTN.red);
    this.showSearch(true);
    this.setStatus('Conectando');
    if (mode === 'host') this.friendBtn.restyle('INVITAR AMIGO', BTN.blue);

    this.searchStart = this.time.now;
    let tip = Phaser.Math.Between(0, TIPS.length - 1);
    this.searchTip.setText(mode === 'host' ? 'Comparte el enlace con tu amigo' : TIPS[tip]);
    this.searchClock.setText('0:00');
    this.searchTimer = this.time.addEvent({
      delay: 400, loop: true,
      callback: () => {
        const secs = Math.floor((this.time.now - this.searchStart) / 1000);
        const botIn = this.botAt ? Math.ceil((this.botAt - this.time.now) / 1000) : 0;
        const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
        if (this.mode === 'host') {
          this.searchClock.setText(this.privateCode ? `Código: ${this.privateCode}  ·  ${clock}` : clock);
        } else {
          this.searchClock.setText(clock + (botIn > 0 ? `  ·  si no hay rivales, bot en ${botIn} s` : ''));
        }
        this.dots = ((this.dots || 0) + 1) % 4;
        this.searchStatus.setText(this.statusBase + '.'.repeat(this.dots));
      },
    });
    this.tipTimer = this.time.addEvent({
      delay: 3500, loop: true,
      callback: () => {
        if (this.mode === 'host') return;
        tip = (tip + 1) % TIPS.length;
        this.tweens.add({
          targets: this.searchTip, alpha: 0, duration: 150, yoyo: true,
          onYoyo: () => this.searchTip.setText(TIPS[tip]),
        });
      },
    });

    // Connect socket
    socket = SERVER_URL ? io(SERVER_URL) : io();

    socket.on('connect', () => {
      const who = { playerName: name, playerId: PLAYER_ID };
      if (this.mode === 'host') {
        this.setStatus('Creando sala');
        socket.emit('createPrivate', who);
      } else if (this.mode === 'join') {
        this.setStatus('Entrando a la sala');
        socket.emit('joinPrivate', { ...who, code: this.privateCode });
      } else {
        this.setStatus('Buscando rival');
        socket.emit('join', { ...who, source: this.autoStart ? 'rematch' : 'menu', lastVsBot: this.lastVsBot });
      }
      this.autoStart = false;
    });

    socket.on('privateCreated', ({ code: newCode }) => {
      this.privateCode = newCode;
      this.setStatus('Esperando a tu amigo');
      CG.showInviteButton({ room: newCode });
      CG.updateRoom({ roomId: `private_${newCode}`, isJoinable: true, inviteParams: { room: newCode } });
    });

    socket.on('privateNotFound', () => {
      this.cancelConnect();
      toast(this, 'Esa sala ya no está disponible', H - 60, C.enemy);
    });

    socket.on('waiting', (data) => {
      this.botAt = data && data.botInMs ? this.time.now + data.botInMs : null;
      this.setStatus('Buscando rival');
    });

    socket.on('matched', (data) => {
      roomId = data.roomId;
      CG.hideInviteButton();
      CG.updateRoom({ roomId: data.roomId, isJoinable: false });
      Sfx.play('ready');
      this.scene.start('Game', {
        myName: data.myName,
        opponentName: data.opponentName,
        roomId: data.roomId,
        isBot: !!data.isBot,
      });
    });

    socket.on('connect_error', () => {
      this.setStatus('Sin conexión, reintentando');
    });
  }

  setStatus(text) {
    this.statusBase = text;
    this.searchStatus.setText(text);
  }

  shareInvite() {
    if (!this.privateCode) return;
    Sfx.play('tap');
    const url = inviteUrl(this.privateCode);
    const text = `¡Te reto en RPS Battle! Mi sala: ${this.privateCode}`;
    if (navigator.share && !CG.enabled) {
      navigator.share({ title: 'RPS Battle', text, url }).catch(() => { /* cancelled */ });
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(url)
        .then(() => toast(this, '¡Enlace copiado! Pásaselo a tu amigo', H - 60))
        .catch(() => toast(this, `Código de sala: ${this.privateCode}`, H - 60));
    } else {
      toast(this, `Código de sala: ${this.privateCode}`, H - 60);
    }
  }

  cancelConnect() {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
    if (this.mode === 'host') {
      CG.hideInviteButton();
      CG.leftRoom();
    }
    this.mode = null;
    this.privateCode = null;
    this.friendBtn.restyle('JUGAR CON AMIGO', BTN.purple);
    Sfx.play('tap');
    if (this.searchTimer) { this.searchTimer.remove(); this.searchTimer = null; }
    if (this.tipTimer) { this.tipTimer.remove(); this.tipTimer = null; }
    const inputEl = document.getElementById('nameInput');
    if (inputEl) inputEl.disabled = !!CG.username;
    this.isConnecting = false;
    this.playBtn.restyle('¡JUGAR!', BTN.green);
    this.playPulse.resume();
    this.showSearch(false);
  }

  cleanup() {
    // A socket.io auto-reconnect must not re-run the menu's join logic mid-game
    if (socket) {
      ['connect', 'waiting', 'matched', 'connect_error', 'privateCreated', 'privateNotFound']
        .forEach(e => socket.off(e));
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  GAME SCENE
// ═══════════════════════════════════════════════════════════════════════════
class GameScene extends Phaser.Scene {
  constructor() { super('Game'); }

  // ── init ──────────────────────────────────────────────────────────────────
  init(data) {
    this.myName       = data.myName       || 'Yo';
    this.opponentName = data.opponentName || 'Rival';
    this.roomId       = data.roomId;
    this.vsBot        = !!data.isBot;

    this.myHp   = MAX_HP;
    this.oppHp  = MAX_HP;
    this.timeLeft = GAME_TIME;
    this.gameActive = false;
    this.ending = false;
    this.selectedItem = null; // type selected from inventory to launch

    // Items on field
    this.myItems  = [];   // { id, type, lane, obj, sprite, dir:-1, … }
    this.oppItems = [];   // { id, type, lane, obj, sprite, dir: 1, … }
    this.itemIdCounter = 0;

    // Craft state per item type
    this.craft = {
      rock:     { step: 0, progressing: false, timer: null, inventory: 0 },
      paper:    { step: 0, progressing: false, timer: null, inventory: 0 },
      scissors: { step: 0, progressing: false, timer: null, inventory: 0 },
    };
    this.craftSlots = {};
    this.invSlots = {};

    this.stats = { launched: 0, clashesWon: 0 };
  }

  // ── create ────────────────────────────────────────────────────────────────
  create() {
    setupCamera(this);
    this.buildField();
    this.buildHUD();
    this.buildCraftPanel();
    this.buildFX();
    this.buildIntro();
    this.setupSockets();
    this.events.once('shutdown', this.shutdown, this);
  }

  // ── HUD ───────────────────────────────────────────────────────────────────
  buildHUD() {
    const bg = this.add.graphics().setDepth(30);
    bg.fillStyle(C.bgDeep, 1).fillRect(0, 0, W, HUD_H);
    bg.fillStyle(C.line, 1).fillRect(0, HUD_H - 2, W, 2);

    const short = s => (s.length > 11 ? s.slice(0, 10) + '…' : s);

    // Me (left)
    this.hudMe = this.add.container(0, 0).setDepth(31);
    this.myBar = { g: this.add.graphics(), side: 'me', shown: MAX_HP, chip: MAX_HP, target: MAX_HP, x: 52, y: 32, w: 112, h: 14 };
    this.myHpText = D(this, 164, 16, `${this.myHp}`, 15, C.text, { strokeThickness: 4 }).setOrigin(1, 0.5);
    this.hudMe.add([
      this.avatar(26, 30, this.myName, C.me),
      T(this, 50, 16, short(this.myName), { fontStyle: '900', fontSize: '13px' }).setOrigin(0, 0.5),
      this.myBar.g, this.myHpText,
    ]);

    // Opponent (right)
    this.hudOpp = this.add.container(0, 0).setDepth(31);
    this.oppBar = { g: this.add.graphics(), side: 'opp', shown: MAX_HP, chip: MAX_HP, target: MAX_HP, x: W - 164, y: 32, w: 112, h: 14 };
    this.oppHpText = D(this, W - 164, 16, `${this.oppHp}`, 15, C.text, { strokeThickness: 4 }).setOrigin(0, 0.5);
    this.hudOpp.add([
      this.avatar(W - 26, 30, this.opponentName, C.enemy),
      T(this, W - 50, 16, short(this.opponentName), { fontStyle: '900', fontSize: '13px' }).setOrigin(1, 0.5),
      this.oppBar.g, this.oppHpText,
    ]);
    this.drawBar(this.myBar);
    this.drawBar(this.oppBar);

    // Timer
    const tg = this.add.graphics().setDepth(31);
    tg.fillStyle(C.ink, 1).fillRoundedRect(W / 2 - 22, 10, 44, 36, 12);
    tg.fillStyle(C.panel, 1).fillRoundedRect(W / 2 - 20, 12, 40, 32, 10);
    this.timerText = D(this, W / 2, 28, '3:00', 18, C.text, { strokeThickness: 4 }).setDepth(32);

    // Rules reminder: rock > scissors > paper > rock
    ['rock', 'scissors', 'paper', 'rock'].forEach((k, i) => {
      img(this, W / 2 - 45 + i * 30, 63, k, 17).setDepth(31);
      if (i < 3) T(this, W / 2 - 30 + i * 30, 63, '>', { fontFamily: FONT_D, fontSize: '11px', color: C.goldHex })
        .setOrigin(0.5).setDepth(31);
    });
  }

  avatar(x, y, name, color) {
    const c = this.add.container(x, y);
    const g = this.add.graphics();
    g.fillStyle(C.ink, 1).fillCircle(0, 0, 20);
    g.fillStyle(color, 1).fillCircle(0, 0, 17);
    g.fillStyle(0xffffff, 0.25).fillCircle(-5, -6, 6);
    c.add([g, D(this, 0, 1, (name[0] || '?').toUpperCase(), 20, INK, { strokeThickness: 0 })]);
    return c;
  }

  drawBar(bar) {
    const { g, x, y, w, h } = bar;
    const right = bar.side === 'opp';
    const pct = Phaser.Math.Clamp(bar.shown / MAX_HP, 0, 1);
    const chip = Phaser.Math.Clamp(bar.chip / MAX_HP, 0, 1);
    const color = right ? C.enemy : pct > 0.5 ? C.me : pct > 0.25 ? C.gold : C.enemy;
    const seg = (p, col, a) => {
      const bw = w * p;
      if (bw < 2) return;
      g.fillStyle(col, a).fillRoundedRect(right ? x + w - bw : x, y, bw, h, Math.min(h / 2, bw / 2));
    };
    g.clear();
    g.fillStyle(C.ink, 1).fillRoundedRect(x - 3, y - 3, w + 6, h + 6, (h + 6) / 2);
    g.fillStyle(0x2a2458, 1).fillRoundedRect(x, y, w, h, h / 2);
    seg(chip, 0xffffff, 0.9);
    seg(pct, color, 1);
    const bw = w * pct;
    if (bw > 10) g.fillStyle(0xffffff, 0.28).fillRoundedRect((right ? x + w - bw : x) + 4, y + 2, bw - 8, h * 0.3, 2);
    g.fillStyle(C.ink, 0.35);
    for (let i = 1; i < 10; i++) g.fillRect(x + (w * i) / 10 - 0.5, y + 3, 1, h - 6);
  }

  setBar(bar, hp) {
    if (hp === bar.target) return false;
    bar.target = hp;
    this.tweens.killTweensOf(bar);
    this.tweens.add({ targets: bar, shown: hp, duration: 180, ease: 'Quad.easeOut', onUpdate: () => this.drawBar(bar) });
    this.tweens.add({ targets: bar, chip: hp, delay: 380, duration: 420, ease: 'Quad.easeIn', onUpdate: () => this.drawBar(bar) });
    return true;
  }

  shakeHud(cont) {
    this.tweens.killTweensOf(cont);
    cont.x = 0;
    this.tweens.add({ targets: cont, x: 5, duration: 40, yoyo: true, repeat: 3, onComplete: () => { cont.x = 0; } });
  }

  // ── Field ─────────────────────────────────────────────────────────────────
  buildField() {
    img(this, W / 2, HUD_H + FIELD_H / 2, 'field_bg');
    img(this, W / 2, FIELD_TOP + 17, 'wall_enemy').setDepth(5);
    img(this, W / 2, FIELD_BOT - 17, 'wall_me').setDepth(5);

    // Lane highlight shown while an item is selected
    this.laneHL = LANE_X.map((x) => {
      const c = this.add.container(x, 0).setDepth(4).setAlpha(0);
      const g = this.add.graphics();
      g.fillStyle(C.me, 0.07).fillRoundedRect(-LANE_W / 2 + 6, FIELD_TOP + 40, LANE_W - 12, FIELD_H - 80, 14);
      g.lineStyle(2, C.me, 0.35).strokeRoundedRect(-LANE_W / 2 + 6, FIELD_TOP + 40, LANE_W - 12, FIELD_H - 80, 14);
      c.add(g);
      for (let k = 0; k < 3; k++) {
        const ch = img(this, 0, FIELD_BOT - 70, 'chev', 26).setTint(C.me).setAlpha(0);
        c.add(ch);
        this.tweens.add({ targets: ch, y: FIELD_TOP + FIELD_H / 2 + 20, duration: 1400, repeat: -1, delay: k * 466 });
        this.tweens.add({ targets: ch, alpha: 0.8, duration: 700, yoyo: true, repeat: -1, delay: k * 466 });
      }
      return c;
    });

    // Lane tap zones (to launch selected item)
    for (let i = 0; i < LANES; i++) {
      const zone = this.add.rectangle(
        LANE_X[i], HUD_H + FIELD_H / 2, LANE_W - 4, FIELD_H - 4, 0x000000, 0
      ).setInteractive();
      zone.laneIndex = i;
      zone.on('pointerdown', () => this.launchSelected(i));
    }

    // Hint pill
    this.hint = this.add.container(W / 2, FIELD_BOT - 62).setDepth(26).setAlpha(0);
    this.hintBg = this.add.graphics();
    this.hintText = T(this, 0, 0, '', { fontStyle: '900', fontSize: '14px' }).setOrigin(0.5);
    this.hint.add([this.hintBg, this.hintText]);
  }

  showHint(msg, color = C.gold, hold = false) {
    this.hintText.setText(msg).setColor(hex(color));
    const w = this.hintText.displayWidth + 32, h = 34;
    this.hintBg.clear();
    this.hintBg.fillStyle(C.ink, 0.9).fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    this.hintBg.lineStyle(2, color, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    this.tweens.killTweensOf(this.hint);
    this.hint.setAlpha(0).setScale(0.8);
    this.tweens.add({ targets: this.hint, alpha: 1, scale: 1, duration: 180, ease: 'Back.easeOut' });
    if (this.hintTimer) this.hintTimer.remove();
    this.hintTimer = hold ? null : this.time.delayedCall(1700, () => this.hideHint());
  }

  hideHint() {
    if (this.hintTimer) { this.hintTimer.remove(); this.hintTimer = null; }
    this.tweens.killTweensOf(this.hint);
    this.tweens.add({ targets: this.hint, alpha: 0, duration: 200 });
  }

  showLanes(on) {
    this.laneHL.forEach(c => {
      this.tweens.killTweensOf(c);
      this.tweens.add({ targets: c, alpha: on ? 1 : 0, duration: 180 });
    });
  }

  laneFlash(lane) {
    const r = this.add.rectangle(LANE_X[lane], HUD_H + FIELD_H / 2, LANE_W, FIELD_H, C.me, 0.18).setDepth(3);
    this.tweens.add({ targets: r, alpha: 0, duration: 300, onComplete: () => r.destroy() });
  }

  // ── Craft Panel ───────────────────────────────────────────────────────────
  buildCraftPanel() {
    const py = FIELD_BOT;
    const bg = this.add.graphics().setDepth(30);
    bg.fillStyle(C.bgDeep, 1).fillRect(0, py, W, CRAFT_H);

    TYPES.forEach((type, ci) => {
      const cx = LANE_X[ci];
      bg.fillStyle(C.panel, 1).fillRoundedRect(cx - 61, py + 8, 122, CRAFT_H - 16, 16);
      bg.lineStyle(2, C.line, 1).strokeRoundedRect(cx - 61, py + 8, 122, CRAFT_H - 16, 16);

      img(this, cx - 36, py + 26, type, 24).setDepth(31);
      D(this, cx + 10, py + 26, NAMES[type], 16, C.text, { strokeThickness: 4 }).setDepth(31);

      // Two step slots
      for (let step = 0; step < CRAFT_STEPS; step++) {
        this.buildCraftSlot(type, step, cx, py + 72 + step * 68);
      }

      img(this, cx, py + 177, 'chev', 18).setFlipY(true).setAlpha(0.3).setDepth(31);

      // Inventory display
      this.buildInventorySlot(type, cx, py + 238);
    });
  }

  buildCraftSlot(type, step, x, y) {
    const slotKey = `${type}_${step}`;
    const c = this.add.container(x, y).setDepth(31);
    const g = this.add.graphics();
    const icon = img(this, -32, -4, `icon_${type}_${step}`, 36);
    const label = T(this, -10, -6, CRAFT_LABELS[type][step], {
      fontStyle: '900', fontSize: '12px', wordWrap: { width: 62 }, lineSpacing: -2,
    }).setOrigin(0, 0.5);
    const mark = img(this, 45, -21, 'lock', 16);
    c.add([g, icon, label, mark]);
    c.setSize(110, 60).setInteractive({ useHandCursor: true });

    const slot = { c, g, icon, label, mark, type, step, x, y, progress: 0, state: null };
    this.craftSlots[slotKey] = slot;
    this.drawStep(slot);

    c.on('pointerdown', () => this.onCraftTap(type, step, slotKey));
  }

  stepState(type, step) {
    const s = this.craft[type];
    if (step < s.step) return 'done';
    if (step === s.step) return s.progressing ? 'working' : 'ready';
    return 'locked';
  }

  drawStep(slot) {
    const st = this.stepState(slot.type, slot.step);
    const look = {
      locked:  { fill: 0x19153a, stroke: 0x2b2560, lw: 2 },
      ready:   { fill: C.panelHi, stroke: C.gold, lw: 3 },
      working: { fill: 0x3a2814, stroke: C.amber, lw: 3 },
      done:    { fill: 0x10332f, stroke: C.me, lw: 2.5 },
    }[st];
    const w = 110, h = 60, g = slot.g;
    g.clear();
    g.fillStyle(look.fill, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 12);
    g.lineStyle(look.lw, look.stroke, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 12);
    g.fillStyle(C.bgDeep, 1).fillRoundedRect(-46, 18, 92, 6, 3);
    const p = st === 'done' ? 1 : st === 'working' ? slot.progress : 0;
    if (p > 0.04) g.fillStyle(st === 'done' ? C.me : C.amber, 1).fillRoundedRect(-46, 18, Math.max(6, 92 * p), 6, 3);

    slot.icon.setAlpha(st === 'locked' ? 0.35 : 1);
    slot.label.setColor(st === 'locked' ? C.dim : st === 'done' ? C.meHex : C.text);
    slot.mark.setVisible(st === 'locked' || st === 'done').setTexture(st === 'done' ? 'check' : 'lock');
    slot.state = st;
  }

  redrawCraft(type) {
    for (let step = 0; step < CRAFT_STEPS; step++) this.drawStep(this.craftSlots[`${type}_${step}`]);
  }

  buildInventorySlot(type, x, y) {
    const c = this.add.container(x, y).setDepth(31);
    const glow = img(this, 0, -4, 'glow', 150).setTint(C.gold).setAlpha(0);
    const g = this.add.graphics();
    const sprite = img(this, 0, -8, type, 54);
    const badge = this.add.container(38, -34);
    const bb = this.add.graphics();
    bb.fillStyle(C.ink, 1).fillCircle(0, 0, 15);
    bb.fillStyle(C.gold, 1).fillCircle(0, 0, 12);
    const count = D(this, 0, 1, '0', 16, INK, { strokeThickness: 0 });
    badge.add([bb, count]);
    const caption = T(this, 0, 34, '', { fontStyle: '900', fontSize: '12px' }).setOrigin(0.5);
    c.add([glow, g, sprite, badge, caption]);
    c.setSize(110, 100).setInteractive({ useHandCursor: true });

    this.invSlots[type] = { c, g, glow, sprite, badge, count, caption, x, y };
    this.updateInventoryUI(type);

    // Tap inv slot to select this item type for launching
    c.on('pointerdown', () => this.onInvTap(type));
  }

  updateInventoryUI(type) {
    const s = this.invSlots[type];
    const n = this.craft[type].inventory;
    const sel = this.selectedItem === type;
    const w = 110, h = 100;
    s.g.clear();
    s.g.fillStyle(sel ? 0x3a3014 : n > 0 ? C.panelHi : 0x19153a, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 16);
    s.g.lineStyle(sel ? 4 : n > 0 ? 3 : 2, sel ? C.gold : n > 0 ? C.me : 0x2b2560, 1)
      .strokeRoundedRect(-w / 2, -h / 2, w, h, 16);
    s.sprite.setAlpha(n > 0 ? 1 : 0.22);
    if (n > 0) s.sprite.clearTint(); else s.sprite.setTint(0x8080a0);
    s.badge.setVisible(n > 0);
    s.count.setText(`${n}`);
    s.caption
      .setText(sel ? '¡A LANZAR!' : n > 0 ? 'ELEGIR' : 'VACÍO')
      .setColor(sel ? C.goldHex : n > 0 ? C.meHex : C.dim);
    s.glow.setAlpha(sel ? 0.5 : 0);
  }

  denyShake(cont, baseX) {
    this.tweens.killTweensOf(cont);
    cont.x = baseX;
    this.tweens.add({ targets: cont, x: baseX + 5, duration: 45, yoyo: true, repeat: 2, onComplete: () => { cont.x = baseX; } });
  }

  // ── Craft Logic ───────────────────────────────────────────────────────────
  onCraftTap(type, step, slotKey) {
    if (!this.gameActive) return;
    const state = this.craft[type];
    const slot = this.craftSlots[slotKey];

    // Only allow tapping steps in order
    if (step !== state.step) {
      if (step > state.step) {
        Sfx.play('deny');
        this.denyShake(slot.c, slot.x);
        this.showHint(`Primero: ${CRAFT_LABELS[type][state.step]}`, C.enemy);
      }
      return;
    }
    if (state.progressing) return;

    state.progressing = true;
    slot.progress = 0;
    Sfx.play('work');
    this.drawStep(slot);

    // Animate progress bar
    this.tweens.add({
      targets: slot,
      progress: 1,
      duration: CRAFT_STEP_DURATION,
      ease: 'Linear',
      onUpdate: () => this.drawStep(slot),
      onComplete: () => {
        state.step++;
        state.progressing = false;
        slot.progress = 0;

        if (state.step >= CRAFT_STEPS) {
          // Item ready!
          state.step = 0;
          state.inventory++;
          this.onItemCrafted(type, slot);
        } else {
          Sfx.play('step');
        }
        this.redrawCraft(type);
      },
    });
  }

  onItemCrafted(type, slot) {
    Sfx.play('ready');
    const inv = this.invSlots[type];
    this.fxSpark.explode(8, slot.x, slot.y);
    const fly = img(this, slot.x, slot.y, type, 36).setDepth(40);
    const endScale = 54 / fly.width;
    this.tweens.add({ targets: fly, x: inv.x, scale: endScale, duration: 380, ease: 'Sine.easeIn' });
    this.tweens.add({
      targets: fly, y: inv.y - 8, duration: 380, ease: 'Back.easeIn',
      onComplete: () => {
        fly.destroy();
        this.updateInventoryUI(type);
        this.tweens.add({ targets: inv.c, scale: 1.12, duration: 90, yoyo: true, ease: 'Quad.easeOut' });
        this.tweens.add({ targets: inv.badge, scale: { from: 1.6, to: 1 }, duration: 250, ease: 'Back.easeOut' });
        if (this.gameActive && !this.selectedItem) this.selectItem(type);
      },
    });
  }

  // ── Item Selection & Launch ───────────────────────────────────────────────
  onInvTap(type) {
    if (!this.gameActive) return;
    const inv = this.invSlots[type];
    if (this.craft[type].inventory <= 0) {
      Sfx.play('deny');
      this.denyShake(inv.c, inv.x);
      this.showHint('Craftea primero los 2 pasos ↑', C.enemy);
      return;
    }
    if (this.selectedItem === type) { Sfx.play('tap'); this.clearSelection(); return; }
    Sfx.play('select');
    this.selectItem(type);
  }

  selectItem(type) {
    if (!this.gameActive) return;
    const state = this.craft[type];
    if (state.inventory <= 0) return;

    this.selectedItem = type;
    TYPES.forEach(t => this.updateInventoryUI(t));
    this.showLanes(true);
    if (this.stats.launched < 2) this.showHint('¡Toca un carril para lanzar!', C.gold, true);
  }

  clearSelection() {
    this.selectedItem = null;
    TYPES.forEach(t => this.updateInventoryUI(t));
    this.showLanes(false);
    this.hideHint();
  }

  launchSelected(laneIndex) {
    if (!this.gameActive) return;
    if (!this.selectedItem) {
      const any = TYPES.some(t => this.craft[t].inventory > 0);
      Sfx.play('deny');
      this.showHint(any ? 'Elige un objeto abajo ↓' : 'Craftea un objeto abajo ↓', C.enemy);
      return;
    }
    const type = this.selectedItem;
    const state = this.craft[type];
    if (state.inventory <= 0) return;

    state.inventory--;
    this.stats.launched++;

    const itemId = `${socket.id}_${++this.itemIdCounter}`;
    const launchTime = Date.now();

    // Spawn local item
    this.spawnItem(itemId, type, laneIndex, 'mine', launchTime);

    // Tell server / opponent
    socket.emit('launch', {
      roomId: this.roomId,
      lane: laneIndex,
      itemType: type,
      itemId,
      launchTime,
    });

    Sfx.play('launch');
    this.laneFlash(laneIndex);
    // Keep the selection while there are more of the same item
    if (state.inventory > 0) {
      this.updateInventoryUI(type);
      this.hideHint();
    } else {
      this.clearSelection();
    }
  }

  // ── Item Spawning ─────────────────────────────────────────────────────────
  spawnItem(itemId, type, lane, owner, launchTime) {
    const isMine = owner === 'mine';
    const startY = isMine ? FIELD_BOT - 28 : FIELD_TOP + 28;
    const dir    = isMine ? -1 : 1; // mine goes up (negative y), opp goes down
    const team   = isMine ? C.me : C.enemy;

    const obj = this.add.container(LANE_X[lane], startY).setDepth(10);
    const glow = img(this, 0, 0, 'glow', 84).setTint(team).setAlpha(0.45);
    const ring = this.add.graphics();
    ring.fillStyle(team, 0.18).fillCircle(0, 0, 25);
    ring.lineStyle(3, team, 0.95).strokeCircle(0, 0, 25);
    ring.fillStyle(team, 1).fillTriangle(0, dir * 37, -6, dir * 29, 6, dir * 29);
    const sprite = img(this, 0, 0, type, 46);
    if (!isMine && type === 'scissors') sprite.setFlipY(true);
    obj.add([glow, ring, sprite]);
    obj.setScale(0);
    this.tweens.add({ targets: obj, scale: 1, duration: 200, ease: 'Back.easeOut' });

    const item = {
      id: itemId, type, lane, obj, sprite, dir, launchTime, owner,
      readyAt: Date.now() + 200,
      baseScale: sprite.scaleX, spin: Math.random() < 0.5 ? -1 : 1, trailT: 0,
    };
    if (isMine) this.myItems.push(item);
    else this.oppItems.push(item);

    if (!isMine) {
      this.shockwave(LANE_X[lane], startY, C.enemy, 90);
      Sfx.play('enemy');
    }
    return item;
  }

  // ── update ────────────────────────────────────────────────────────────────
  update(time, delta) {
    this.animateUI(time);
    if (!this.gameActive) return;
    const dt = delta / 1000;

    this.moveItems(this.myItems,  dt);
    this.moveItems(this.oppItems, dt);
    this.animateItems(time, dt);
    this.checkCollisions();
    this.checkBaseDamage();
  }

  animateUI(time) {
    const pulse = 1 + 0.035 * Math.sin(time * 0.008);
    Object.values(this.craftSlots).forEach(s => {
      s.c.setScale(this.gameActive && s.state === 'ready' ? pulse : 1);
      s.icon.angle = s.state === 'working' ? Math.sin(time * 0.035) * 16 : 0;
    });
    TYPES.forEach(t => {
      const inv = this.invSlots[t];
      inv.sprite.y = this.selectedItem === t ? -8 + Math.sin(time * 0.01) * 4 : -8;
    });
  }

  moveItems(list, dt) {
    const now = Date.now();
    list.forEach(item => {
      if (now < item.readyAt) return;
      item.obj.y += item.dir * ITEM_SPEED * dt;
    });
  }

  animateItems(time, dt) {
    const now = Date.now();
    const anim = (item, trail) => {
      const s = item.sprite;
      if (item.type === 'rock') s.rotation += item.spin * 3 * dt;
      else if (item.type === 'paper') s.rotation = Math.sin(time * 0.008 + item.lane) * 0.28;
      else s.scaleX = item.baseScale * (0.82 + 0.18 * Math.abs(Math.cos(time * 0.012)));
      item.trailT -= dt;
      if (item.trailT <= 0 && now >= item.readyAt) {
        item.trailT = 0.035;
        trail.emitParticleAt(item.obj.x + Phaser.Math.Between(-6, 6), item.obj.y - item.dir * 20, 1);
      }
    };
    this.myItems.forEach(i => anim(i, this.fxTrailMe));
    this.oppItems.forEach(i => anim(i, this.fxTrailOpp));
  }

  checkCollisions() {
    for (let i = this.myItems.length - 1; i >= 0; i--) {
      const mine = this.myItems[i];
      for (let j = this.oppItems.length - 1; j >= 0; j--) {
        const opp = this.oppItems[j];
        if (mine.lane !== opp.lane) continue;
        const dist = Math.abs(mine.obj.y - opp.obj.y);
        if (dist < ITEM_RADIUS * 1.8) {
          this.resolveCollision(mine, i, opp, j);
          return; // only one collision per frame to keep things clean
        }
      }
    }
  }

  resolveCollision(mine, mi, opp, oi) {
    const result = this.rpsResult(mine.type, opp.type);
    const x = mine.obj.x;
    const y = (mine.obj.y + opp.obj.y) / 2;
    this.spawnCollisionFX(x, y);

    if (result === 'win') {
      this.stats.clashesWon++;
      this.punch(mine);
      this.destroyItem(this.oppItems, oi);
      this.floatText(x, y - 34, '¡GANAS!', C.me, 18);
    } else if (result === 'lose') {
      this.punch(opp);
      this.destroyItem(this.myItems, mi);
      this.floatText(x, y - 34, '¡PIERDES!', C.enemy, 18);
    } else {
      // tie — both destroyed
      this.destroyItem(this.myItems, mi);
      this.destroyItem(this.oppItems, oi);
      this.floatText(x, y - 34, 'EMPATE', 0xc4bfe8, 18);
    }
  }

  rpsResult(myType, oppType) {
    if (BEATS[myType] === oppType) return 'win';
    if (BEATS[oppType] === myType) return 'lose';
    return 'tie';
  }

  destroyItem(list, index) {
    const item = list[index];
    list.splice(index, 1);
    this.burstAt(item.obj.x, item.obj.y, ITEM_TINT[item.type], 14);
    this.tweens.killTweensOf(item.obj);
    this.tweens.add({
      targets: item.obj,
      scale: 1.35, alpha: 0,
      duration: 180,
      onComplete: () => item.obj.destroy(),
    });
  }

  punch(item) {
    this.tweens.add({ targets: item.obj, scale: 1.3, duration: 90, yoyo: true, ease: 'Quad.easeOut' });
  }

  checkBaseDamage() {
    // My items reached top (opponent base) – the opponent's client reports
    // the damage to the server, we only show the hit
    for (let i = this.myItems.length - 1; i >= 0; i--) {
      const item = this.myItems[i];
      if (item.obj.y < FIELD_TOP - ITEM_RADIUS) {
        const x = item.obj.x;
        this.destroyItem(this.myItems, i);
        this.enemyBaseHit(x);
      }
    }
    // Opponent items reached bottom (my base) – I'm the victim, so I report it
    for (let i = this.oppItems.length - 1; i >= 0; i--) {
      const item = this.oppItems[i];
      if (item.obj.y > FIELD_BOT + ITEM_RADIUS) {
        const x = item.obj.x;
        this.destroyItem(this.oppItems, i);
        this.myHp = Math.max(0, this.myHp - DAMAGE);
        this.updateMyHp(this.myHp);
        socket.emit('baseDamage', { roomId: this.roomId, damage: DAMAGE });
        this.myBaseHit(x);
      }
    }
  }

  // ── FX ────────────────────────────────────────────────────────────────────
  buildFX() {
    const P = (key, cfg) => this.add.particles(0, 0, key, Object.assign({ emitting: false }, cfg));
    const trail = tint => P('dot', {
      lifespan: 380, speed: { min: 4, max: 18 }, angle: { min: 0, max: 360 },
      scale: { start: 0.9 * INV, end: 0 }, alpha: { start: 0.6, end: 0 },
      tint, blendMode: 'ADD',
    }).setDepth(9);
    this.fxTrailMe  = trail(C.me);
    this.fxTrailOpp = trail(C.enemy);
    this.fxBurst = P('chunk', {
      lifespan: 520, speed: { min: 80, max: 230 }, angle: { min: 0, max: 360 },
      scale: { start: 1.1 * INV, end: 0 }, rotate: { min: 0, max: 360 }, gravityY: 320,
    }).setDepth(12);
    this.fxSpark = P('spark', {
      lifespan: 420, speed: { min: 60, max: 260 }, angle: { min: 0, max: 360 },
      scale: { start: 1.2 * INV, end: 0 }, blendMode: 'ADD',
      tint: [0xffffff, 0xffe28a, C.gold],
    }).setDepth(13);

    this.vignette = img(this, W / 2, H / 2, 'vignette').setScale(2).setDepth(45).setAlpha(0);
  }

  burstAt(x, y, color, n) {
    this.fxBurst.setParticleTint(color);
    this.fxBurst.explode(n, x, y);
  }

  shockwave(x, y, color, size) {
    const r = img(this, x, y, 'ring', 16).setTint(color).setDepth(11).setAlpha(0.9);
    this.tweens.add({
      targets: r, scale: size / r.width, alpha: 0, duration: 380, ease: 'Cubic.easeOut',
      onComplete: () => r.destroy(),
    });
  }

  floatText(x, y, str, color, size = 22) {
    const t = D(this, x, y, str, size, hex(color)).setDepth(35).setScale(0.5);
    this.tweens.add({ targets: t, scale: 1, duration: 160, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, y: y - 46, alpha: 0, delay: 380, duration: 550, onComplete: () => t.destroy() });
  }

  spawnCollisionFX(x, y) {
    this.fxSpark.explode(14, x, y);
    this.shockwave(x, y, 0xffffff, 110);
    this.cameras.main.shake(70, 0.003);
    Sfx.play('clash');
  }

  enemyBaseHit(x) {
    const y = FIELD_TOP + 20;
    this.burstAt(x, y, C.enemy, 18);
    this.fxSpark.explode(12, x, y);
    this.shockwave(x, y, C.gold, 130);
    this.floatText(x, y + 34, '-10', C.gold, 30);
    this.cameras.main.shake(90, 0.004);
    Sfx.play('hit');
  }

  myBaseHit(x) {
    const y = FIELD_BOT - 20;
    this.burstAt(x, y, C.me, 18);
    this.fxSpark.explode(10, x, y);
    this.shockwave(x, y, C.enemy, 130);
    this.floatText(x, y - 36, '-10', C.enemy, 30);
    this.cameras.main.shake(200, 0.012);
    this.tweens.killTweensOf(this.vignette);
    this.vignette.setAlpha(0.9);
    this.tweens.add({ targets: this.vignette, alpha: 0, duration: 500 });
    Sfx.play('hurt');
    buzz(90);
  }

  // ── HP Updates ────────────────────────────────────────────────────────────
  updateMyHp(hp) {
    this.myHp = hp;
    this.myHpText.setText(`${hp}`);
    if (this.setBar(this.myBar, hp)) this.shakeHud(this.hudMe);
  }

  updateOppHp(hp) {
    this.oppHp = hp;
    this.oppHpText.setText(`${hp}`);
    if (this.setBar(this.oppBar, hp)) this.shakeHud(this.hudOpp);
  }

  // ── Timer ─────────────────────────────────────────────────────────────────
  updateTimer(seconds) {
    this.timeLeft = seconds;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    this.timerText.setText(`${m}:${s.toString().padStart(2, '0')}`);
    if (seconds <= 30) this.timerText.setColor(C.enemyHex);
    else if (seconds <= 60) this.timerText.setColor(C.goldHex);
    else this.timerText.setColor(C.text);
    if (seconds <= 10 && seconds > 0) {
      Sfx.play('tick');
      this.tweens.add({ targets: this.timerText, scale: { from: 1.4, to: 1 }, duration: 260, ease: 'Quad.easeOut' });
    }
  }

  // ── Intro (VS + countdown) ────────────────────────────────────────────────
  buildIntro() {
    const o = this.add.container(0, 0).setDepth(50);
    const dim = this.add.rectangle(W / 2, H / 2, W, H, C.bgDeep, 0.8);
    const opp = this.banner(this.opponentName, C.enemy, this.vsBot ? 'BOT' : 'RIVAL').setPosition(W + 200, H / 2 - 120);
    const me = this.banner(this.myName, C.me, 'TÚ').setPosition(-200, H / 2 + 80);
    const vs = D(this, W / 2, H / 2 - 20, 'VS', 88, C.goldHex, { strokeThickness: 12 }).setScale(0);
    this.cdText = D(this, W / 2, H / 2 - 20, '', 140, C.text, { strokeThickness: 16 }).setAlpha(0);
    o.add([dim, opp, me, vs, this.cdText]);

    this.tweens.add({ targets: opp, x: W / 2, duration: 450, delay: 100, ease: 'Back.easeOut' });
    this.tweens.add({ targets: me, x: W / 2, duration: 450, delay: 100, ease: 'Back.easeOut' });
    this.tweens.add({ targets: vs, scale: 1, duration: 400, delay: 400, ease: 'Back.easeOut' });
    this.intro = { o, dim, opp, me, vs, vsGone: false };
  }

  banner(name, color, tag) {
    const c = this.add.container(0, 0);
    const g = this.add.graphics();
    g.fillStyle(C.ink, 1).fillRoundedRect(-154, -38, 308, 76, 22);
    g.fillStyle(color, 1).fillRoundedRect(-150, -34, 300, 68, 18);
    g.fillStyle(0xffffff, 0.18).fillRoundedRect(-142, -28, 284, 20, 10);
    c.add([
      g,
      T(this, -134, -22, tag, { fontStyle: '900', fontSize: '12px', color: INK }).setOrigin(0, 0.5),
      D(this, 0, 6, name, 30, C.text, { strokeThickness: 6 }),
    ]);
    return c;
  }

  onCountdown(count) {
    const intro = this.intro;
    if (!intro) return;
    if (!intro.vsGone) {
      intro.vsGone = true;
      this.tweens.add({ targets: intro.opp, x: -W, duration: 250, ease: 'Quad.easeIn' });
      this.tweens.add({ targets: intro.me, x: W * 2, duration: 250, ease: 'Quad.easeIn' });
      this.tweens.add({ targets: intro.vs, scale: 0, alpha: 0, duration: 200 });
    }
    const t = this.cdText;
    this.tweens.killTweensOf(t);
    t.setText(count > 0 ? `${count}` : '¡YA!')
      .setColor(count > 0 ? C.text : C.goldHex)
      .setAlpha(1).setScale(2.2);
    this.tweens.add({ targets: t, scale: 1, duration: 380, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, alpha: 0, delay: 650, duration: 250 });
    Sfx.play(count > 0 ? 'count' : 'go');
  }

  endIntro() {
    const intro = this.intro;
    if (!intro) return;
    this.intro = null;
    this.tweens.add({ targets: intro.dim, alpha: 0, duration: 300 });
    this.time.delayedCall(950, () => intro.o.destroy());
  }

  showFinale(text, color = C.goldHex) {
    const t = D(this, W / 2, H / 2 - 60, text, 72, color, { strokeThickness: 12 }).setDepth(60).setScale(3).setAlpha(0);
    this.tweens.add({ targets: t, scale: 1, alpha: 1, duration: 350, ease: 'Back.easeOut' });
    this.cameras.main.flash(200, 255, 255, 255);
    this.cameras.main.shake(250, 0.01);
    Sfx.play('ko');
  }

  // ── Sockets ───────────────────────────────────────────────────────────────
  setupSockets() {
    socket.on('countdown', ({ count }) => this.onCountdown(count));

    socket.on('gameStart', () => {
      this.gameActive = true;
      CG.gameplayStart();
      this.endIntro();
      this.time.delayedCall(700, () => {
        if (!this.selectedItem) this.showHint('¡Craftea! Toca el paso 1 ↓', C.gold);
      });
    });

    socket.on('tick', ({ timeLeft }) => {
      this.updateTimer(timeLeft);
    });

    socket.on('opponentLaunch', ({ lane, itemType, itemId, launchTime }) => {
      this.spawnItem(itemId, itemType, lane, 'opp', launchTime);
    });

    socket.on('hpUpdate', ({ hp }) => {
      this.updateMyHp(hp);
    });

    socket.on('opponentHp', ({ hp }) => {
      this.updateOppHp(hp);
    });

    socket.on('gameOver', ({ winnerId, hp }) => {
      if (this.ending) return;
      this.ending = true;
      this.gameActive = false;
      const iWon = winnerId === socket.id;
      const isDraw = winnerId === null;
      const oppId = Object.keys(hp).find(id => id !== socket.id);
      const myHp = hp[socket.id] || 0;
      const oppHp = hp[oppId] || 0;
      this.updateMyHp(myHp);
      this.updateOppHp(oppHp);
      this.clearSelection();
      CG.gameplayStop();
      this.showFinale(myHp <= 0 || oppHp <= 0 ? '¡K.O.!' : '¡TIEMPO!');
      this.time.delayedCall(1600, () => this.scene.start('GameOver', {
        result: isDraw ? 'draw' : (iWon ? 'win' : 'lose'),
        myHp,
        oppHp,
        myName: this.myName,
        oppName: this.opponentName,
        vsBot: this.vsBot,
        roomId: this.roomId,
        stats: { ...this.stats, damage: MAX_HP - oppHp },
      }));
    });

    socket.on('opponentDisconnected', () => {
      if (this.ending) return;
      this.ending = true;
      this.gameActive = false;
      this.clearSelection();
      CG.gameplayStop();
      this.showFinale('¡HUYÓ!', C.meHex);
      this.time.delayedCall(1200, () => this.scene.start('GameOver', {
        result: 'win',
        myHp: this.myHp,
        oppHp: this.oppHp,
        myName: this.myName,
        oppName: this.opponentName,
        vsBot: this.vsBot,
        disconnected: true,
        stats: { ...this.stats, damage: MAX_HP - this.oppHp },
      }));
    });

    socket.on('disconnect', (reason) => {
      if (this.ending || reason === 'io client disconnect') return;
      this.ending = true;
      this.gameActive = false;
      CG.gameplayStop();
      CG.leftRoom();
      const s = socket;
      socket = null;
      s.disconnect(); // stop auto-reconnect, the room is gone anyway
      this.scene.start('Menu', { notice: 'Se perdió la conexión' });
    });
  }

  // ── Shutdown ──────────────────────────────────────────────────────────────
  shutdown() {
    if (socket) {
      socket.off('countdown');
      socket.off('gameStart');
      socket.off('tick');
      socket.off('opponentLaunch');
      socket.off('hpUpdate');
      socket.off('opponentHp');
      socket.off('gameOver');
      socket.off('opponentDisconnected');
      socket.off('disconnect');
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  GAME OVER SCENE
// ═══════════════════════════════════════════════════════════════════════════
class GameOverScene extends Phaser.Scene {
  constructor() { super('GameOver'); }

  init(data) {
    this.data2 = data;
  }

  create() {
    setupCamera(this);
    const { result, myHp, oppHp, myName, oppName, disconnected, stats = {} } = this.data2;
    this.oppGone = !!disconnected;
    this.wantRematch = false;

    img(this, W / 2, H / 2, 'menu_bg');
    this.floaters = addFloaters(this, 8);

    const look = {
      win:  { title: '¡VICTORIA!', color: C.gold },
      lose: { title: 'DERROTA',    color: C.enemy },
      draw: { title: 'EMPATE',     color: C.amber },
    }[result];

    // Hero art
    const heroY = 170;
    if (result === 'win') {
      const rays = img(this, W / 2, heroY, 'rays', 380).setAlpha(0.9);
      this.tweens.add({ targets: rays, angle: 360, duration: 14000, repeat: -1 });
      const trophy = img(this, W / 2, heroY, 'trophy', 150).setScale(0);
      this.tweens.add({ targets: trophy, scale: 150 / trophy.width, duration: 600, ease: 'Back.easeOut' });
      this.tweens.add({ targets: trophy, y: heroY - 10, duration: 1000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: 600 });
      this.confetti();
    } else if (result === 'lose') {
      const heart = img(this, W / 2, heroY - 60, 'heart_broken', 140).setAlpha(0);
      this.tweens.add({ targets: heart, y: heroY, alpha: 1, duration: 600, ease: 'Bounce.easeOut' });
    } else {
      TYPES.forEach((k, i) => {
        const s = img(this, W / 2 - 80 + i * 80, heroY, k, 72).setScale(0);
        this.tweens.add({ targets: s, scale: 72 / s.width, duration: 400, delay: i * 120, ease: 'Back.easeOut' });
      });
    }

    const title = D(this, W / 2, 300, look.title, 54, hex(look.color), { strokeThickness: 10 })
      .setShadow(0, 6, '#000000', 0, true, true).setScale(0);
    this.tweens.add({ targets: title, scale: 1, duration: 500, delay: 150, ease: 'Back.easeOut' });

    const sub = disconnected ? 'Tu rival abandonó la partida'
      : result === 'win' ? `Venciste a ${oppName}`
      : result === 'lose' ? `${oppName} te venció… ¡pide la revancha!`
      : '¡Qué pelea tan pareja!';
    T(this, W / 2, 350, sub, { fontStyle: '800', fontSize: '16px', color: C.muted, align: 'center', wordWrap: { width: 330 } })
      .setOrigin(0.5);

    // Score card
    const card = this.add.graphics();
    card.fillStyle(C.panel, 0.92).fillRoundedRect(20, 385, W - 40, 190, 22);
    card.lineStyle(2, C.line, 1).strokeRoundedRect(20, 385, W - 40, 190, 22);
    this.scoreColumn(W / 2 - 88, myName, myHp, C.me);
    this.scoreColumn(W / 2 + 88, oppName, oppHp, C.enemy);
    D(this, W / 2, 432, 'VS', 22, C.goldHex, { strokeThickness: 4 });
    card.fillStyle(C.line, 1).fillRect(40, 478, W - 80, 2);

    [
      ['LANZADOS', stats.launched || 0],
      ['CHOQUES\nGANADOS', stats.clashesWon || 0],
      ['DAÑO\nHECHO', stats.damage || 0],
    ].forEach(([label, val], i) => {
      const x = W / 2 - 112 + i * 112;
      const n = D(this, x, 508, '0', 28, C.text, { strokeThickness: 5 });
      T(this, x, 546, label, { fontStyle: '900', fontSize: '11px', color: C.muted, align: 'center', lineSpacing: -2 })
        .setOrigin(0.5);
      this.tweens.addCounter({
        from: 0, to: val, duration: 800, delay: 500 + i * 150,
        onUpdate: tw => n.setText(`${Math.round(tw.getValue())}`),
      });
    });

    // Buttons
    this.again = makeButton(this, W / 2, 640, 280, 68, this.oppGone ? 'NUEVO RIVAL' : 'REVANCHA', BTN.green,
      () => this.onRematch(), 32);
    this.againPulse = this.tweens.add({
      targets: this.again, scale: 1.05, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: 1200,
    });
    makeButton(this, W / 2 - 72, 728, 130, 54, 'MENÚ', BTN.purple, () => this.leave(false), 22);
    makeButton(this, W / 2 + 72, 728, 130, 54, 'COMPARTIR', BTN.blue, () => this.share(result, oppName), 20);
    addMuteButton(this, W - 32, 34);

    this.setupSockets();
    this.events.once('shutdown', () => {
      if (socket) ['rematchRequested', 'rematchStart', 'rematchUnavailable', 'opponentLeft'].forEach(e => socket.off(e));
    });

    Sfx.play(result === 'win' ? 'win' : result === 'lose' ? 'lose' : 'draw');
    if (result === 'win') CG.happytime();
    // Natural break between matches: the SDK decides whether an ad is due
    CG.midgameAd();
  }

  setupSockets() {
    if (!socket) return;
    socket.on('rematchRequested', () => {
      if (this.wantRematch) return;
      Sfx.play('select');
      toast(this, `¡${this.data2.oppName} quiere la revancha!`, 790);
      this.again.restyle('¡ACEPTAR!', BTN.green);
    });
    socket.on('rematchStart', () => {
      this.scene.start('Game', {
        myName: this.data2.myName,
        opponentName: this.data2.oppName,
        roomId: this.data2.roomId,
        isBot: !!this.data2.vsBot,
      });
    });
    const gone = () => {
      if (this.oppGone) return;
      this.oppGone = true;
      if (this.wantRematch) { this.leave(true); return; }
      toast(this, 'Tu rival se fue', 790, C.enemy);
      this.again.restyle('NUEVO RIVAL', BTN.green);
    };
    socket.on('rematchUnavailable', gone);
    socket.on('opponentLeft', gone);
  }

  onRematch() {
    if (this.oppGone || !socket || !socket.connected) { this.leave(true); return; }
    if (this.wantRematch) return;
    this.wantRematch = true;
    Sfx.play('select');
    this.againPulse.pause();
    this.again.setScale(1);
    this.again.restyle('ESPERANDO…', BTN.purple);
    socket.emit('rematch');
  }

  leave(autoStart) {
    if (socket) socket.disconnect();
    socket = null;
    roomId = null;
    CG.leftRoom();
    this.scene.start('Menu', { autoStart, lastVsBot: !!this.data2.vsBot });
  }

  update(time, delta) {
    updateFloaters(this.floaters, delta / 1000);
  }

  scoreColumn(x, name, hp, color) {
    D(this, x, 420, name.length > 12 ? name.slice(0, 11) + '…' : name, 18, hex(color), { strokeThickness: 4 });
    const g = this.add.graphics();
    const w = 130, h = 12, bx = x - w / 2, by = 440;
    const bw = w * Phaser.Math.Clamp(hp / MAX_HP, 0, 1);
    g.fillStyle(C.ink, 1).fillRoundedRect(bx - 3, by - 3, w + 6, h + 6, (h + 6) / 2);
    g.fillStyle(0x2a2458, 1).fillRoundedRect(bx, by, w, h, h / 2);
    if (bw > 2) g.fillStyle(color, 1).fillRoundedRect(bx, by, bw, h, Math.min(h / 2, bw / 2));
    T(this, x, 464, `${hp} HP`, { fontStyle: '900', fontSize: '13px', color: C.text }).setOrigin(0.5);
  }

  confetti() {
    const e = this.add.particles(0, 0, 'confetti', {
      x: { min: 0, max: W }, y: -10,
      lifespan: 3200, speedY: { min: 120, max: 260 }, speedX: { min: -60, max: 60 },
      rotate: { min: 0, max: 360 }, scale: { min: 0.8 * INV, max: 1.3 * INV },
      tint: [C.gold, C.me, C.enemy, 0x8b6cff, 0xffffff],
      frequency: 25, gravityY: 60,
    }).setDepth(50);
    this.time.delayedCall(2200, () => e.stop());
  }

  share(result, oppName) {
    track('share_click', { result });
    const url = CG.inviteLink({ ref: 'share' }) || location.origin;
    const text = result === 'win'
      ? `¡Le gané a ${oppName} en RPS Battle! ⚔️ ¿Te atreves a retarme?`
      : '¡Juega RPS Battle conmigo! Craftea piedra, papel o tijera y lánzaselos a tu rival ⚔️';
    Sfx.play('tap');
    if (navigator.share && !CG.enabled) {
      navigator.share({ title: 'RPS Battle', text, url }).catch(() => { /* cancelled */ });
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(`${text} ${url}`)
        .then(() => toast(this, '¡Enlace copiado!', 790))
        .catch(() => toast(this, url, 790));
    } else {
      toast(this, url, 790);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  PHASER CONFIG
// ═══════════════════════════════════════════════════════════════════════════
const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: W * RES,
  height: H * RES,
  backgroundColor: '#0c0a1f',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: { activePointers: 3 },
  disableContextMenu: true,
  scene: [BootScene, MenuScene, GameScene, GameOverScene],
};

// Wait for the web fonts so Phaser text doesn't render in a fallback font
window.addEventListener('load', () => {
  let ref = '';
  try { ref = document.referrer ? new URL(document.referrer).hostname : ''; } catch (e) { /* bad referrer */ }
  track('app_open', {
    standalone: !!(window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true,
    ref,
  });
  const fonts = document.fonts
    ? Promise.all([
        document.fonts.load('40px "Lilita One"'),
        document.fonts.load('700 16px "Nunito"'),
        document.fonts.load('900 16px "Nunito"'),
      ])
    : Promise.resolve();
  const timeout = ms => new Promise(r => setTimeout(r, ms));
  Promise.all([
    Promise.race([fonts, timeout(2500)]).catch(() => {}),
    Promise.race([CG.init(), timeout(4000)]).catch(() => {}),
  ]).then(() => {
    const params = new URLSearchParams(location.search);
    pendingInvite = CG.inviteParam('room') || params.get('room');
    if (params.has('room')) {
      try { history.replaceState(null, '', location.pathname); } catch (e) { /* sandboxed */ }
    }
    phaserGame = new Phaser.Game(config);
  });
});
