// Builds the CrazyGames upload: dist/rps-battle-crazygames.zip
// The client files are hosted by CrazyGames; they connect to our game server.
//   RPS_SERVER=https://my-server.example npm run build:crazygames
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SERVER = process.env.RPS_SERVER || 'https://rps-battle-production-7f46.up.railway.app';
const root = path.join(__dirname, '..');
const src = path.join(root, 'public');
const dist = path.join(root, 'dist');
const out = path.join(dist, 'crazygames');
const zip = path.join(dist, 'rps-battle-crazygames.zip');

fs.rmSync(out, { recursive: true, force: true });
fs.rmSync(zip, { force: true });
fs.mkdirSync(out, { recursive: true });

['game.js', 'icon.svg'].forEach(f => fs.copyFileSync(path.join(src, f), path.join(out, f)));

let html = fs.readFileSync(path.join(src, 'index.html'), 'utf8');
const replace = (from, to) => {
  const found = from instanceof RegExp ? from.test(html) : html.includes(from);
  if (!found) throw new Error(`index.html: not found ${from}`);
  html = html.replace(from, to);
};
// PWA install bits make no sense inside the CrazyGames iframe
replace(/\s*<link rel="manifest"[^>]*>/, '');
replace(/\s*<link rel="apple-touch-icon"[^>]*>/, '');
replace('<script src="game.js"></script>', [
  '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>',
  `  <script>window.RPS_SERVER = ${JSON.stringify(SERVER)};</script>`,
  '  <script src="game.js"></script>',
].join('\n'));
fs.writeFileSync(path.join(out, 'index.html'), html);

execSync(`zip -qr "${zip}" .`, { cwd: out });
console.log(`Built ${path.relative(root, zip)} → server ${SERVER}`);
