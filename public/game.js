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

// Craft step labels
const CRAFT_LABELS = {
  rock:     ['Picar piedra', 'Pulir'],
  paper:    ['Sembrar árbol', 'Cortar'],
  scissors: ['Picar metal', 'Afilar'],
};

// Item colours (cartoon palette)
const COLOURS = {
  rock:     { fill: 0x9e9e9e, shine: 0xd0d0d0, shadow: 0x616161 },
  paper:    { fill: 0xfffde7, shine: 0xffffff, shadow: 0xf9a825 },
  scissors: { fill: 0xb0bec5, shine: 0xeceff1, shadow: 0x546e7a },
};

// Shared socket reference (set before GameScene starts)
let socket = null;
let roomId  = null;

// ═══════════════════════════════════════════════════════════════════════════
//  BOOT SCENE  – generates all textures programmatically
// ═══════════════════════════════════════════════════════════════════════════
class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  create() {
    this.generateTextures();
    this.scene.start('Menu');
  }

  // ── Texture helpers ──────────────────────────────────────────────────────
  generateTextures() {
    this.makeRock();
    this.makePaper();
    this.makeScissors();
    this.makeCraftIcons();
    this.makeLaneBg();
    this.makeButtonBg();
    this.makeHpBar();
  }

  // Draw a texture using a Graphics object then bake into a key
  bake(key, w, h, fn) {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    fn(g);
    g.generateTexture(key, w, h);
    g.destroy();
  }

  makeRock() {
    this.bake('rock', 50, 50, g => {
      // shadow
      g.fillStyle(0x424242, 0.4);
      g.fillEllipse(28, 42, 36, 14);
      // body
      g.fillStyle(0x9e9e9e);
      g.fillCircle(24, 24, 22);
      // shade
      g.fillStyle(0x757575);
      g.fillCircle(28, 28, 14);
      // shine
      g.fillStyle(0xd0d0d0, 0.8);
      g.fillCircle(16, 16, 8);
      g.fillStyle(0xe0e0e0, 0.5);
      g.fillCircle(14, 14, 4);
    });
  }

  makePaper() {
    this.bake('paper', 44, 52, g => {
      // shadow
      g.fillStyle(0x000000, 0.2);
      g.fillRoundedRect(4, 6, 38, 44, 4);
      // body
      g.fillStyle(0xfffde7);
      g.fillRoundedRect(2, 2, 38, 44, 4);
      // border
      g.lineStyle(1.5, 0xf9a825);
      g.strokeRoundedRect(2, 2, 38, 44, 4);
      // lines
      g.lineStyle(1, 0xc8b900, 0.6);
      for (let y = 14; y <= 38; y += 8) {
        g.lineBetween(8, y, 34, y);
      }
      // dog-ear
      g.fillStyle(0xf9e89d);
      g.fillTriangle(30, 2, 40, 2, 40, 12);
    });
  }

  makeScissors() {
    this.bake('scissors', 52, 52, g => {
      const cx = 26, cy = 26;
      // blade 1
      g.fillStyle(0xb0bec5);
      g.fillEllipse(cx - 8, cy - 4, 36, 12, 1);
      // blade 2
      g.fillStyle(0x90a4ae);
      g.fillEllipse(cx + 8, cy + 4, 36, 12, 1);
      // pivot circle
      g.fillStyle(0xeceff1);
      g.fillCircle(cx, cy, 7);
      g.lineStyle(2, 0x546e7a);
      g.strokeCircle(cx, cy, 7);
      // shine
      g.fillStyle(0xffffff, 0.6);
      g.fillEllipse(cx - 10, cy - 6, 12, 5);
    });
  }

  makeCraftIcons() {
    // Rock step icons
    this.bake('icon_rock_0', 44, 44, g => {
      // jagged raw rock
      g.fillStyle(0x78909c);
      g.fillPoints([
        { x: 22, y: 4 }, { x: 38, y: 12 }, { x: 42, y: 26 },
        { x: 34, y: 40 }, { x: 14, y: 40 }, { x: 4, y: 26 },
        { x: 8, y: 12 }
      ], true);
      g.fillStyle(0xb0bec5, 0.4);
      g.fillCircle(16, 18, 7);
    });
    this.bake('icon_rock_1', 44, 44, g => {
      g.fillStyle(0x9e9e9e);
      g.fillCircle(22, 22, 18);
      g.fillStyle(0xd0d0d0, 0.7);
      g.fillCircle(16, 16, 8);
    });

    // Paper step icons
    this.bake('icon_paper_0', 44, 44, g => {
      // tree
      g.fillStyle(0x388e3c);
      g.fillTriangle(22, 4, 40, 30, 4, 30);
      g.fillStyle(0x2e7d32);
      g.fillTriangle(22, 14, 38, 36, 6, 36);
      // trunk
      g.fillStyle(0x5d4037);
      g.fillRect(18, 32, 8, 10);
    });
    this.bake('icon_paper_1', 44, 44, g => {
      g.fillStyle(0xfffde7);
      g.fillRoundedRect(6, 4, 32, 36, 3);
      g.lineStyle(1.5, 0xf9a825);
      g.strokeRoundedRect(6, 4, 32, 36, 3);
      g.lineStyle(1, 0xc8b900, 0.5);
      for (let y = 14; y <= 32; y += 7) g.lineBetween(10, y, 30, y);
    });

    // Scissors step icons
    this.bake('icon_scissors_0', 44, 44, g => {
      // metal bar / ingot
      g.fillStyle(0x90a4ae);
      g.fillRoundedRect(6, 16, 32, 12, 4);
      g.fillStyle(0xeceff1, 0.6);
      g.fillRoundedRect(8, 18, 28, 4, 2);
    });
    this.bake('icon_scissors_1', 44, 44, g => {
      g.fillStyle(0xb0bec5);
      g.fillEllipse(14, 20, 28, 10);
      g.fillStyle(0x90a4ae);
      g.fillEllipse(30, 28, 28, 10);
      g.fillStyle(0xeceff1);
      g.fillCircle(22, 24, 5);
      g.lineStyle(1.5, 0x546e7a);
      g.strokeCircle(22, 24, 5);
    });

    // Craft slot backgrounds
    this.bake('craft_slot', 110, 70, g => {
      g.fillStyle(0x1e293b);
      g.fillRoundedRect(2, 2, 106, 66, 8);
      g.lineStyle(2, 0x334155);
      g.strokeRoundedRect(2, 2, 106, 66, 8);
    });
    this.bake('craft_slot_active', 110, 70, g => {
      g.fillStyle(0x4a0000);
      g.fillRoundedRect(2, 2, 106, 66, 8);
      g.lineStyle(2, 0xef4444);
      g.strokeRoundedRect(2, 2, 106, 66, 8);
    });
    this.bake('craft_slot_ready', 110, 70, g => {
      g.fillStyle(0x064e3b);
      g.fillRoundedRect(2, 2, 106, 66, 8);
      g.lineStyle(2, 0x10b981);
      g.strokeRoundedRect(2, 2, 106, 66, 8);
    });
  }

  makeLaneBg() {
    this.bake('lane_bg', W, FIELD_H, g => {
      // background gradient-ish
      g.fillStyle(0x0f172a);
      g.fillRect(0, 0, W, FIELD_H);
      // lane separators
      g.lineStyle(1, 0x1e3a5f, 0.7);
      g.lineBetween(LANE_W, 0, LANE_W, FIELD_H);
      g.lineBetween(LANE_W * 2, 0, LANE_W * 2, FIELD_H);
      // mid divider (no-man's-land)
      const mid = FIELD_H / 2;
      g.lineStyle(2, 0x3b82f6, 0.5);
      g.lineBetween(0, mid, W, mid);
      // lane centre dashes
      for (let y = 8; y < FIELD_H; y += 20) {
        g.lineStyle(1, 0x1e3a5f, 0.4);
        g.lineBetween(LANE_X[0], y, LANE_X[0], y + 10);
        g.lineBetween(LANE_X[1], y, LANE_X[1], y + 10);
        g.lineBetween(LANE_X[2], y, LANE_X[2], y + 10);
      }
    });
  }

  makeButtonBg() {
    this.bake('btn_blue', 160, 48, g => {
      g.fillStyle(0x2563eb);
      g.fillRoundedRect(0, 0, 160, 48, 12);
      g.lineStyle(2, 0x60a5fa);
      g.strokeRoundedRect(0, 0, 160, 48, 12);
    });
    this.bake('btn_green', 160, 48, g => {
      g.fillStyle(0x16a34a);
      g.fillRoundedRect(0, 0, 160, 48, 12);
      g.lineStyle(2, 0x4ade80);
      g.strokeRoundedRect(0, 0, 160, 48, 12);
    });
    this.bake('btn_red', 160, 48, g => {
      g.fillStyle(0xdc2626);
      g.fillRoundedRect(0, 0, 160, 48, 12);
      g.lineStyle(2, 0xf87171);
      g.strokeRoundedRect(0, 0, 160, 48, 12);
    });
  }

  makeHpBar() {
    this.bake('hp_bar_bg', 140, 16, g => {
      g.fillStyle(0x1e293b);
      g.fillRoundedRect(0, 0, 140, 16, 8);
    });
    this.bake('hp_bar_fill', 136, 12, g => {
      g.fillStyle(0xef4444);
      g.fillRoundedRect(0, 0, 136, 12, 6);
    });
    this.bake('hp_bar_fill_green', 136, 12, g => {
      g.fillStyle(0x22c55e);
      g.fillRoundedRect(0, 0, 136, 12, 6);
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  MENU SCENE  –  Enter name → connect → waiting room
// ═══════════════════════════════════════════════════════════════════════════
class MenuScene extends Phaser.Scene {
  constructor() { super('Menu'); }

  create() {
    // BG
    this.add.rectangle(W / 2, H / 2, W, H, 0x0f172a);

    // Title
    this.add.text(W / 2, 140, '⚔️ RPS BATTLE', {
      fontSize: '36px', fontStyle: 'bold', color: '#f1f5f9',
      stroke: '#3b82f6', strokeThickness: 4
    }).setOrigin(0.5);

    this.add.text(W / 2, 195, 'Piedra · Papel · Tijera', {
      fontSize: '16px', color: '#94a3b8'
    }).setOrigin(0.5);

    // Name input
    this.add.text(W / 2, 280, 'Tu nombre:', {
      fontSize: '18px', color: '#cbd5e1'
    }).setOrigin(0.5);

    // DOM input
    this.nameInput = this.add.dom(W / 2, 330).createFromHTML(
      `<input id="nameInput" type="text" maxlength="16"
        placeholder="Jugador"
        style="width:240px;padding:12px 16px;font-size:18px;border:2px solid #3b82f6;
               border-radius:10px;background:#1e293b;color:#f1f5f9;
               outline:none;text-align:center;" />`
    );

    // Stop Phaser from eating pointer/touch events meant for the input
    const inputEl = document.getElementById('nameInput');
    if (inputEl) {
      ['mousedown', 'touchstart', 'pointerdown'].forEach(evt =>
        inputEl.addEventListener(evt, e => e.stopPropagation(), { passive: false })
      );
    }

    // Play button
    this.isConnecting = false;
    this.playBtn = this.add.image(W / 2, 420, 'btn_blue').setInteractive();
    this.playBtnText = this.add.text(W / 2, 420, 'JUGAR', {
      fontSize: '20px', fontStyle: 'bold', color: '#ffffff'
    }).setOrigin(0.5);

    this.playBtn.on('pointerdown', () => {
      if (this.isConnecting) this.cancelConnect();
      else this.startConnect();
    });
    this.playBtn.on('pointerover', () => {
      if (!this.isConnecting)
        this.tweens.add({ targets: this.playBtn, scaleX: 1.05, scaleY: 1.05, duration: 80 });
    });
    this.playBtn.on('pointerout', () => this.tweens.add({ targets: this.playBtn, scaleX: 1, scaleY: 1, duration: 80 }));

    // Status text
    this.statusText = this.add.text(W / 2, 490, '', {
      fontSize: '16px', color: '#94a3b8'
    }).setOrigin(0.5);

    // Decor
    this.add.text(W / 2, H - 60, '🪨  📄  ✂️', {
      fontSize: '40px'
    }).setOrigin(0.5);
  }

  startConnect() {
    const inputEl = document.getElementById('nameInput');
    const name = (inputEl ? inputEl.value.trim() : '') || 'Jugador';

    this.isConnecting = true;
    this.playBtn.setTexture('btn_red');
    this.playBtnText.setText('CANCELAR');
    this.statusText.setText('Conectando…');

    // Connect socket
    socket = io();

    socket.on('connect', () => {
      this.statusText.setText('Buscando rival…');
      socket.emit('join', { playerName: name });
    });

    socket.on('waiting', () => {
      this.statusText.setText('⏳ Esperando rival…');
      this.dotAnim();
    });

    socket.on('matched', (data) => {
      roomId = data.roomId;
      this.statusText.setText(`¡Rival encontrado! vs ${data.opponentName}`);
      this.scene.start('Game', {
        myName: data.myName,
        opponentName: data.opponentName,
        roomId: data.roomId,
      });
    });

    socket.on('connect_error', () => {
      this.statusText.setText('❌ Error de conexión');
    });
  }

  cancelConnect() {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
    if (this.dotTimer) { this.dotTimer.remove(); this.dotTimer = null; }
    this.isConnecting = false;
    this.playBtn.setTexture('btn_blue');
    this.playBtnText.setText('JUGAR');
    this.statusText.setText('');
  }

  dotAnim() {
    let dots = 0;
    this.dotTimer = this.time.addEvent({
      delay: 500, repeat: -1,
      callback: () => {
        dots = (dots + 1) % 4;
        this.statusText.setText('⏳ Esperando rival' + '.'.repeat(dots));
      }
    });
  }

  shutdown() {
    if (this.dotTimer) this.dotTimer.remove();
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

    this.myHp   = MAX_HP;
    this.oppHp  = MAX_HP;
    this.timeLeft = GAME_TIME;
    this.gameActive = false;
    this.selectedItem = null; // { type } — item selected from inventory to launch

    // Items on field
    this.myItems  = [];   // { id, type, lane, x, y, sprite, label, dir:1 }
    this.oppItems = [];   // { id, type, lane, x, y, sprite, label, dir:-1 }
    this.itemIdCounter = 0;

    // Craft state per item type
    this.craft = {
      rock:     { step: 0, progressing: false, timer: null, inventory: 0 },
      paper:    { step: 0, progressing: false, timer: null, inventory: 0 },
      scissors: { step: 0, progressing: false, timer: null, inventory: 0 },
    };
  }

  // ── create ────────────────────────────────────────────────────────────────
  create() {
    this.buildHUD();
    this.buildField();
    this.buildCraftPanel();
    this.setupSockets();

    // Countdown overlay
    this.countdownText = this.add.text(W / 2, H / 2 - 60, '', {
      fontSize: '80px', fontStyle: 'bold', color: '#f1f5f9',
      stroke: '#3b82f6', strokeThickness: 6
    }).setOrigin(0.5).setDepth(20);

    this.add.text(W / 2, HUD_H + FIELD_H / 2 - 10, '— DEFENSA —', {
      fontSize: '11px', color: '#3b82f6', alpha: 0.6
    }).setOrigin(0.5).setDepth(1);
  }

  // ── HUD ───────────────────────────────────────────────────────────────────
  buildHUD() {
    // Background
    this.add.rectangle(W / 2, HUD_H / 2, W, HUD_H, 0x0f172a);
    this.add.line(W / 2, HUD_H, 0, HUD_H, W, HUD_H, 0x334155);

    // My HP
    this.add.image(74, 24, 'hp_bar_bg').setOrigin(0.5, 0.5);
    this.myHpFill = this.add.image(74, 24, 'hp_bar_fill_green').setOrigin(0.5, 0.5);
    this.myHpText = this.add.text(74, 24, `${this.myHp}`, {
      fontSize: '11px', fontStyle: 'bold', color: '#fff'
    }).setOrigin(0.5, 0.5).setDepth(1);
    this.add.text(4, 10, this.myName, {
      fontSize: '12px', color: '#94a3b8'
    });

    // Opponent HP
    this.add.image(W - 74, 24, 'hp_bar_bg').setOrigin(0.5, 0.5);
    this.oppHpFill = this.add.image(W - 74, 24, 'hp_bar_fill').setOrigin(0.5, 0.5);
    this.oppHpText = this.add.text(W - 74, 24, `${this.oppHp}`, {
      fontSize: '11px', fontStyle: 'bold', color: '#fff'
    }).setOrigin(0.5, 0.5).setDepth(1);
    this.add.text(W - 4, 10, this.opponentName, {
      fontSize: '12px', color: '#e2e8f0', align: 'right'
    }).setOrigin(1, 0);

    // Timer
    this.timerText = this.add.text(W / 2, HUD_H / 2, '3:00', {
      fontSize: '24px', fontStyle: 'bold', color: '#f1f5f9'
    }).setOrigin(0.5);

    // Status strip (ready / waiting)
    this.statusStrip = this.add.text(W / 2, HUD_H - 12, 'Esperando…', {
      fontSize: '11px', color: '#64748b'
    }).setOrigin(0.5);
  }

  // ── Field ─────────────────────────────────────────────────────────────────
  buildField() {
    this.add.image(W / 2, HUD_H + FIELD_H / 2, 'lane_bg');

    // Lane tap zones (to launch selected item)
    for (let i = 0; i < LANES; i++) {
      const zone = this.add.rectangle(
        LANE_X[i], HUD_H + FIELD_H / 2, LANE_W - 4, FIELD_H - 4, 0x000000, 0
      ).setInteractive();
      zone.laneIndex = i;
      zone.on('pointerdown', () => this.launchSelected(i));
    }

    // Lane numbers (subtle)
    for (let i = 0; i < LANES; i++) {
      this.add.text(LANE_X[i], FIELD_BOT - 10, `${i + 1}`, {
        fontSize: '11px', color: '#1e3a5f'
      }).setOrigin(0.5, 1);
    }
  }

  // ── Craft Panel ───────────────────────────────────────────────────────────
  buildCraftPanel() {
    const py = FIELD_BOT;

    // Background
    this.add.rectangle(W / 2, py + CRAFT_H / 2, W, CRAFT_H, 0x0f172a);
    this.add.line(W / 2, py, 0, py, W, py, 0x334155);

    // Column headers
    const types = ['rock', 'paper', 'scissors'];
    const emojis = ['🪨', '📄', '✂️'];
    const colX = [65, 195, 325];

    types.forEach((type, ci) => {
      this.add.text(colX[ci], py + 14, emojis[ci], {
        fontSize: '22px'
      }).setOrigin(0.5);

      // Two step slots
      for (let step = 0; step < CRAFT_STEPS; step++) {
        const sy = py + 44 + step * 80;
        this.buildCraftSlot(type, step, colX[ci], sy);
      }

      // Inventory display
      const invY = py + 44 + CRAFT_STEPS * 80 + 10;
      this.buildInventorySlot(type, colX[ci], invY);
    });
  }

  buildCraftSlot(type, step, x, y) {
    const key = `craft_slot`;
    const img = this.add.image(x, y, key).setInteractive({ useHandCursor: true });
    img.craftType = type;
    img.craftStep = step;

    // Icon
    const iconKey = `icon_${type}_${step}`;
    this.add.image(x - 20, y, iconKey).setScale(0.75);

    // Label text
    const label = this.add.text(x + 8, y - 10, CRAFT_LABELS[type][step], {
      fontSize: '11px', color: '#94a3b8', wordWrap: { width: 60 }
    }).setOrigin(0, 0.5);

    // Progress bar background
    const pbBg = this.add.rectangle(x + 8, y + 14, 58, 6, 0x1e293b).setOrigin(0, 0.5);
    const pb   = this.add.rectangle(x + 8, y + 14, 0,  6, 0x3b82f6).setOrigin(0, 0.5);

    // Store references
    const slotKey = `${type}_${step}`;
    if (!this.craftSlots) this.craftSlots = {};
    this.craftSlots[slotKey] = { img, pb, pbBg, label, x, y, type, step };

    img.on('pointerdown', () => this.onCraftTap(type, step, slotKey));
  }

  buildInventorySlot(type, x, y) {
    const bg = this.add.rectangle(x, y, 70, 44, 0x1e293b).setOrigin(0.5);
    bg.setStrokeStyle(1.5, 0x334155);

    const icon = this.add.image(x - 10, y, type).setScale(0.7).setAlpha(0.3);
    const count = this.add.text(x + 18, y, '0', {
      fontSize: '20px', fontStyle: 'bold', color: '#475569'
    }).setOrigin(0.5);

    if (!this.invSlots) this.invSlots = {};
    this.invSlots[type] = { bg, icon, count, x, y };

    // Tap inv slot to select this item type for launching
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => this.selectItem(type));
  }

  // ── Craft Logic ───────────────────────────────────────────────────────────
  onCraftTap(type, step, slotKey) {
    if (!this.gameActive) return;
    const state = this.craft[type];

    // Only allow tapping steps in order
    if (step === 0 && state.step !== 0) return;
    if (step === 1 && state.step !== 1) return;
    if (state.progressing) return;

    state.progressing = true;
    const slot = this.craftSlots[slotKey];

    // Flash slot
    slot.img.setTexture('craft_slot_active');

    // Animate progress bar
    const duration = CRAFT_STEP_DURATION;
    this.tweens.add({
      targets: slot.pb,
      width: 58,
      duration,
      ease: 'Linear',
      onComplete: () => {
        state.step++;
        state.progressing = false;
        slot.pb.width = 0;

        if (state.step >= CRAFT_STEPS) {
          // Item ready!
          state.step = 0;
          state.inventory++;
          slot.img.setTexture('craft_slot_ready');
          this.time.delayedCall(200, () => slot.img.setTexture('craft_slot'));
          this.updateInventoryUI(type);
        } else {
          slot.img.setTexture('craft_slot');
        }
      }
    });
  }

  updateInventoryUI(type) {
    const inv = this.invSlots[type];
    const count = this.craft[type].inventory;
    inv.count.setText(`${count}`);
    inv.count.setColor(count > 0 ? '#22c55e' : '#475569');
    inv.icon.setAlpha(count > 0 ? 1 : 0.3);
    inv.bg.setStrokeStyle(count > 0 ? 2 : 1.5, count > 0 ? 0x22c55e : 0x334155);
  }

  // ── Item Selection & Launch ───────────────────────────────────────────────
  selectItem(type) {
    if (!this.gameActive) return;
    const state = this.craft[type];
    if (state.inventory <= 0) return;

    this.selectedItem = type;

    // Highlight selected inv slot
    Object.keys(this.invSlots).forEach(t => {
      const sl = this.invSlots[t];
      sl.bg.setStrokeStyle(t === type ? 3 : 1.5, t === type ? 0xfbbf24 : 0x334155);
    });

    // Hint text
    this.statusStrip.setText(`🎯 Toca un carril para lanzar ${type === 'rock' ? '🪨' : type === 'paper' ? '📄' : '✂️'}`);
  }

  launchSelected(laneIndex) {
    if (!this.gameActive || !this.selectedItem) return;
    const type = this.selectedItem;
    const state = this.craft[type];
    if (state.inventory <= 0) return;

    state.inventory--;
    this.updateInventoryUI(type);

    // Clear selection
    this.selectedItem = null;
    Object.keys(this.invSlots).forEach(t =>
      this.invSlots[t].bg.setStrokeStyle(1.5, 0x334155)
    );
    this.statusStrip.setText('');

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
  }

  // ── Item Spawning ─────────────────────────────────────────────────────────
  spawnItem(itemId, type, lane, owner, launchTime) {
    const isMine = owner === 'mine';
    const startY = isMine ? FIELD_BOT - ITEM_RADIUS - 4 : FIELD_TOP + ITEM_RADIUS + 4;
    const dir    = isMine ? -1 : 1; // mine goes up (negative y), opp goes down

    const sprite = this.add.image(LANE_X[lane], startY, type).setScale(0.9).setDepth(5);
    const label  = this.add.text(LANE_X[lane], startY - 28, type[0].toUpperCase(), {
      fontSize: '9px', color: isMine ? '#22c55e' : '#ef4444'
    }).setOrigin(0.5).setDepth(6);

    // Glow tint
    if (isMine) sprite.setTint(0xd1fae5);
    else sprite.setTint(0xfee2e2);

    const item = { id: itemId, type, lane, sprite, label, dir, launchTime, owner };
    if (isMine) this.myItems.push(item);
    else this.oppItems.push(item);

    return item;
  }

  // ── update ────────────────────────────────────────────────────────────────
  update(time, delta) {
    if (!this.gameActive) return;
    const dt = delta / 1000;

    this.moveItems(this.myItems,  dt);
    this.moveItems(this.oppItems, dt);
    this.checkCollisions();
    this.checkBaseDamage();
  }

  moveItems(list, dt) {
    list.forEach(item => {
      item.sprite.y += item.dir * ITEM_SPEED * dt;
      item.label.y   = item.sprite.y - 28;
    });
  }

  checkCollisions() {
    for (let i = this.myItems.length - 1; i >= 0; i--) {
      const mine = this.myItems[i];
      for (let j = this.oppItems.length - 1; j >= 0; j--) {
        const opp = this.oppItems[j];
        if (mine.lane !== opp.lane) continue;
        const dist = Math.abs(mine.sprite.y - opp.sprite.y);
        if (dist < ITEM_RADIUS * 1.8) {
          this.resolveCollision(mine, i, opp, j);
          return; // only one collision per frame to keep things clean
        }
      }
    }
  }

  resolveCollision(mine, mi, opp, oi) {
    const result = this.rpsResult(mine.type, opp.type);
    this.spawnCollisionFX(mine.sprite.x, (mine.sprite.y + opp.sprite.y) / 2);

    if (result === 'win') {
      this.destroyItem(this.oppItems, oi);
    } else if (result === 'lose') {
      this.destroyItem(this.myItems, mi);
    } else {
      // tie — both destroyed
      this.destroyItem(this.myItems, mi);
      this.destroyItem(this.oppItems, oi);
    }
  }

  rpsResult(myType, oppType) {
    if (BEATS[myType] === oppType) return 'win';
    if (BEATS[oppType] === myType) return 'lose';
    return 'tie';
  }

  destroyItem(list, index) {
    const item = list[index];
    this.tweens.add({
      targets: [item.sprite, item.label],
      scaleX: 0, scaleY: 0, alpha: 0,
      duration: 200,
      onComplete: () => { item.sprite.destroy(); item.label.destroy(); }
    });
    list.splice(index, 1);
  }

  spawnCollisionFX(x, y) {
    const sparks = ['💥', '⚡', '✨'];
    const txt = this.add.text(x, y, sparks[Phaser.Math.Between(0, 2)], {
      fontSize: '28px'
    }).setOrigin(0.5).setDepth(10);
    this.tweens.add({
      targets: txt,
      y: y - 40, alpha: 0, scaleX: 1.5, scaleY: 1.5,
      duration: 500,
      onComplete: () => txt.destroy()
    });
  }

  checkBaseDamage() {
    // My items reached top (opponent base)
    for (let i = this.myItems.length - 1; i >= 0; i--) {
      const item = this.myItems[i];
      if (item.sprite.y < FIELD_TOP - ITEM_RADIUS) {
        this.destroyItem(this.myItems, i);
        socket.emit('baseDamage', { roomId: this.roomId, damage: DAMAGE });
        this.showDamageEffect(true);
      }
    }
    // Opponent items reached bottom (my base)
    for (let i = this.oppItems.length - 1; i >= 0; i--) {
      const item = this.oppItems[i];
      if (item.sprite.y > FIELD_BOT + ITEM_RADIUS) {
        this.destroyItem(this.oppItems, i);
        this.myHp = Math.max(0, this.myHp - DAMAGE);
        this.updateMyHp(this.myHp);
        this.showDamageEffect(false);
      }
    }
  }

  showDamageEffect(iAttacked) {
    const x = W / 2;
    const y = iAttacked ? FIELD_TOP + 30 : FIELD_BOT - 30;
    const color = iAttacked ? '#4ade80' : '#ef4444';
    const msg = iAttacked ? '+10 💥' : '-10 ❤️';
    const txt = this.add.text(x, y, msg, {
      fontSize: '22px', fontStyle: 'bold', color, stroke: '#000', strokeThickness: 3
    }).setOrigin(0.5).setDepth(15);
    this.tweens.add({
      targets: txt, y: y - 50, alpha: 0, duration: 800,
      onComplete: () => txt.destroy()
    });

    // Screen flash
    const flash = this.add.rectangle(W / 2, H / 2, W, H,
      iAttacked ? 0x22c55e : 0xef4444, 0.18
    ).setDepth(14);
    this.time.delayedCall(150, () => flash.destroy());
  }

  // ── HP Updates ────────────────────────────────────────────────────────────
  updateMyHp(hp) {
    this.myHp = hp;
    const pct = hp / MAX_HP;
    this.myHpFill.setScale(pct, 1);
    this.myHpFill.setTexture(pct > 0.4 ? 'hp_bar_fill_green' : 'hp_bar_fill');
    this.myHpText.setText(`${hp}`);
  }

  updateOppHp(hp) {
    this.oppHp = hp;
    const pct = hp / MAX_HP;
    this.oppHpFill.setScale(pct, 1);
    this.oppHpText.setText(`${hp}`);
  }

  // ── Timer ─────────────────────────────────────────────────────────────────
  updateTimer(seconds) {
    this.timeLeft = seconds;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    this.timerText.setText(`${m}:${s.toString().padStart(2, '0')}`);
    if (seconds <= 30) this.timerText.setColor('#ef4444');
    else if (seconds <= 60) this.timerText.setColor('#f59e0b');
    else this.timerText.setColor('#f1f5f9');
  }

  // ── Sockets ───────────────────────────────────────────────────────────────
  setupSockets() {
    socket.on('countdown', ({ count }) => {
      this.countdownText.setText(count > 0 ? `${count}` : '¡YA!');
      this.tweens.add({
        targets: this.countdownText,
        scaleX: 1.6, scaleY: 1.6, alpha: 0,
        duration: 800,
        onComplete: () => {
          this.countdownText.setScale(1).setAlpha(1).setText('');
        }
      });
    });

    socket.on('gameStart', () => {
      this.gameActive = true;
      this.statusStrip.setText('');
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
      this.gameActive = false;
      const iWon = winnerId === socket.id;
      const isDraw = winnerId === null;
      this.scene.start('GameOver', {
        result: isDraw ? 'draw' : (iWon ? 'win' : 'lose'),
        myHp: hp[socket.id] || 0,
        oppHp: Object.values(hp).find((_, i) => Object.keys(hp)[i] !== socket.id) || 0,
        myName: this.myName,
        oppName: this.opponentName,
      });
    });

    socket.on('opponentDisconnected', () => {
      this.gameActive = false;
      this.scene.start('GameOver', {
        result: 'win',
        myHp: this.myHp,
        oppHp: 0,
        myName: this.myName,
        oppName: this.opponentName,
        disconnected: true,
      });
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
    const { result, myHp, oppHp, myName, oppName, disconnected } = this.data2;

    this.add.rectangle(W / 2, H / 2, W, H, 0x0f172a);

    // Big result
    const emoji = result === 'win' ? '🏆' : result === 'lose' ? '💀' : '🤝';
    const msg   = result === 'win' ? '¡GANASTE!' : result === 'lose' ? 'PERDISTE' : 'EMPATE';
    const col   = result === 'win' ? '#22c55e'   : result === 'lose' ? '#ef4444' : '#f59e0b';

    this.add.text(W / 2, 200, emoji, { fontSize: '80px' }).setOrigin(0.5);
    this.add.text(W / 2, 310, msg, {
      fontSize: '48px', fontStyle: 'bold', color: col,
      stroke: '#000', strokeThickness: 4
    }).setOrigin(0.5);

    if (disconnected) {
      this.add.text(W / 2, 380, 'El rival se desconectó', {
        fontSize: '16px', color: '#94a3b8'
      }).setOrigin(0.5);
    }

    // HP summary
    this.add.text(W / 2, 430, `${myName}: ❤️ ${myHp} HP`, {
      fontSize: '18px', color: '#f1f5f9'
    }).setOrigin(0.5);
    this.add.text(W / 2, 460, `${oppName}: ❤️ ${oppHp} HP`, {
      fontSize: '18px', color: '#94a3b8'
    }).setOrigin(0.5);

    // Play again
    const btnAgain = this.add.image(W / 2, 560, 'btn_blue').setInteractive({ useHandCursor: true });
    this.add.text(W / 2, 560, 'JUGAR DE NUEVO', {
      fontSize: '18px', fontStyle: 'bold', color: '#fff'
    }).setOrigin(0.5);

    btnAgain.on('pointerdown', () => {
      socket.disconnect();
      socket = null;
      roomId = null;
      this.scene.start('Menu');
    });

    // Animate result text
    this.tweens.add({
      targets: this.children.list[2], // emoji
      scaleX: 1.2, scaleY: 1.2,
      yoyo: true, repeat: -1,
      duration: 800
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  PHASER CONFIG
// ═══════════════════════════════════════════════════════════════════════════
const config = {
  type: Phaser.AUTO,
  width: W,
  height: H,
  backgroundColor: '#0f172a',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  dom: {
    createContainer: true
  },
  scene: [BootScene, MenuScene, GameScene, GameOverScene],
};

window.onload = () => { new Phaser.Game(config); };
