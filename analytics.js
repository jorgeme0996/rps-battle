// ═══════════════════════════════════════════════════════════════════════════
//  ANALYTICS  –  server-side events
//  • Every event is logged as a JSON line ("[analytics] {...}") → Railway logs
//  • Daily aggregates are kept in memory for /admin/stats (reset on redeploy)
//  • If POSTHOG_KEY is set, events are also forwarded to PostHog (durable)
// ═══════════════════════════════════════════════════════════════════════════

const POSTHOG_KEY = process.env.POSTHOG_KEY;
const POSTHOG_HOST = process.env.POSTHOG_HOST || 'https://us.i.posthog.com';
const KEEP_DAYS = 30;
const CLIENT_EVENTS = new Set(['app_open', 'tutorial_open', 'share_click']);

const bootedAt = new Date();
const days = {};

const today = () => new Date().toISOString().slice(0, 10);

function bucket() {
  const d = today();
  if (!days[d]) {
    days[d] = {
      players: new Set(), appOpens: 0, installedOpens: 0, tutorialOpens: 0, shares: 0,
      queueJoins: 0, rematches: 0, queueLeaves: 0, waitMs: 0, waits: 0,
      pvpPlayers: 0, botPlayers: 0, finished: 0, durationMs: 0, launches: 0, quits: 0,
      botWins: 0, botLosses: 0, botDraws: 0,
    };
    Object.keys(days).sort().slice(0, -KEEP_DAYS).forEach(k => delete days[k]);
  }
  return days[d];
}

function aggregate(event, playerId, p) {
  const b = bucket();
  if (playerId) b.players.add(playerId);
  switch (event) {
    case 'app_open':      b.appOpens++; if (p.standalone) b.installedOpens++; break;
    case 'tutorial_open': b.tutorialOpens++; break;
    case 'share_click':   b.shares++; break;
    case 'queue_join':    b.queueJoins++; if (p.source === 'rematch') b.rematches++; break;
    case 'queue_leave':   b.queueLeaves++; break;
    case 'match_start':
      b.waitMs += p.waitMs || 0; b.waits++;
      if (p.vsBot) b.botPlayers++; else b.pvpPlayers++;
      break;
    case 'match_end':
      b.finished++;
      b.durationMs += p.durationMs || 0;
      b.launches += p.launches || 0;
      if (p.result === 'quit') b.quits++;
      if (p.vsBot) {
        if (p.result === 'win') b.botLosses++;
        else if (p.result === 'lose') b.botWins++;
        else if (p.result === 'draw') b.botDraws++;
      }
      break;
  }
}

function track(event, playerId, props = {}) {
  const ts = new Date().toISOString();
  console.log('[analytics]', JSON.stringify({ event, playerId, ts, ...props }));
  aggregate(event, playerId, props);
  if (POSTHOG_KEY) {
    fetch(`${POSTHOG_HOST}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: POSTHOG_KEY, event, distinct_id: playerId || 'anonymous', properties: props, timestamp: ts }),
    }).catch(() => { /* analytics must never break the game */ });
  }
}

// Events sent by the browser: only whitelisted names and small, flat props
function trackClient(event, playerId, props) {
  if (!CLIENT_EVENTS.has(event) || typeof playerId !== 'string' || playerId.length > 64) return;
  const clean = {};
  Object.entries(props && typeof props === 'object' ? props : {}).slice(0, 8).forEach(([k, v]) => {
    if (['string', 'number', 'boolean'].includes(typeof v)) clean[k.slice(0, 32)] = typeof v === 'string' ? v.slice(0, 100) : v;
  });
  track(event, playerId, clean);
}

// ── /admin/stats page ──────────────────────────────────────────────────────
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '–');
const avg = (a, b, unit = '') => (b ? `${(a / b).toFixed(1)}${unit}` : '–');

function renderStats(live) {
  const rows = [
    ['Jugadores únicos', b => b.players.size],
    ['Visitas (app abierta)', b => b.appOpens],
    ['…desde app instalada', b => b.installedOpens],
    ['Entradas a la cola', b => b.queueJoins],
    ['Abandonos esperando', b => `${b.queueLeaves} (${pct(b.queueLeaves, b.queueJoins)})`],
    ['Espera promedio', b => avg(b.waitMs / 1000, b.waits, ' s')],
    ['Partidas PvP', b => b.pvpPlayers / 2],
    ['Partidas vs bot', b => b.botPlayers],
    ['Duración promedio', b => avg(b.durationMs / 1000, b.finished, ' s')],
    ['Lanzamientos por jugador', b => avg(b.launches, b.finished)],
    ['Abandonos en partida', b => `${b.quits} (${pct(b.quits, b.finished)})`],
    ['Tasa de revancha', b => pct(b.rematches, b.finished)],
    ['Jugadores que le ganan al bot', b => pct(b.botLosses, b.botLosses + b.botWins + b.botDraws)],
    ['Tutorial abierto', b => b.tutorialOpens],
    ['Compartir', b => b.shares],
  ];
  const dates = Object.keys(days).sort().reverse();
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const head = dates.map(d => `<th>${d}</th>`).join('');
  const body = rows.map(([label, fn]) =>
    `<tr><td>${label}</td>${dates.map(d => `<td>${esc(fn(days[d]))}</td>`).join('')}</tr>`).join('');

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>RPS Stats</title>
<style>
  body { font: 14px/1.4 system-ui, sans-serif; background: #0c0a1f; color: #fff7ea; margin: 0; padding: 16px; }
  h1 { font-size: 20px; margin: 0 0 4px; } p { color: #a59fd0; margin: 0 0 16px; }
  .live { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
  .live div { background: #1f1a42; border-radius: 12px; padding: 10px 14px; }
  .live b { display: block; font-size: 22px; color: #2ee6c5; }
  .wrap { overflow-x: auto; }
  table { border-collapse: collapse; background: #1f1a42; border-radius: 12px; overflow: hidden; }
  th, td { padding: 8px 12px; text-align: right; border-bottom: 1px solid #2c2566; white-space: nowrap; }
  td:first-child, th:first-child { text-align: left; color: #a59fd0; }
  th { color: #ffc93c; }
</style></head><body>
<h1>RPS Battle · Estadísticas</h1>
<p>Desde ${bootedAt.toISOString().replace('T', ' ').slice(0, 16)} UTC (se reinicia con cada deploy${POSTHOG_KEY ? '; también en PostHog' : ''})</p>
<div class="live">
  <div><b>${live.online}</b>conectados</div>
  <div><b>${live.queue}</b>en cola</div>
  <div><b>${live.rooms}</b>partidas activas</div>
</div>
<div class="wrap"><table><tr><th>Métrica (UTC)</th>${head}</tr>${body}</table></div>
</body></html>`;
}

module.exports = { track, trackClient, renderStats };
