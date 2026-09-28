// Builds the web bundle shared by the native apps (Capacitor webDir): dist/native-web
// Then `npx cap sync ios` / `npx cap sync android` copies it into each project.
// Everything is bundled locally (no CDNs) and the game connects to RPS_SERVER.
//   npm run build:ios      |  npm run build:android
//   RPS_SERVER=https://my-server.example npm run build:android
const fs = require('fs');
const path = require('path');

const SERVER = process.env.RPS_SERVER || 'https://rps-battle-production-7f46.up.railway.app';
const root = path.join(__dirname, '..');
const src = path.join(root, 'public');
const out = path.join(root, 'dist', 'native-web');
const mod = p => path.join(root, 'node_modules', p);

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'vendor'), { recursive: true });
fs.mkdirSync(path.join(out, 'fonts'), { recursive: true });

fs.copyFileSync(path.join(src, 'game.js'), path.join(out, 'game.js'));
fs.copyFileSync(mod('phaser/dist/phaser.min.js'), path.join(out, 'vendor/phaser.min.js'));
fs.copyFileSync(mod('socket.io-client/dist/socket.io.min.js'), path.join(out, 'vendor/socket.io.min.js'));

const fonts = [
  ['Lilita One', 400, '@fontsource/lilita-one/files/lilita-one-latin-400-normal.woff2'],
  ['Nunito', 700, '@fontsource/nunito/files/nunito-latin-700-normal.woff2'],
  ['Nunito', 800, '@fontsource/nunito/files/nunito-latin-800-normal.woff2'],
  ['Nunito', 900, '@fontsource/nunito/files/nunito-latin-900-normal.woff2'],
];
const fontCss = fonts.map(([family, weight, file]) => {
  const name = path.basename(file);
  fs.copyFileSync(mod(file), path.join(out, 'fonts', name));
  return `    @font-face { font-family: '${family}'; font-weight: ${weight}; font-style: normal; font-display: block; src: url('fonts/${name}') format('woff2'); }`;
}).join('\n');

let html = fs.readFileSync(path.join(src, 'index.html'), 'utf8');
const replace = (from, to) => {
  const found = from instanceof RegExp ? from.test(html) : html.includes(from);
  if (!found) throw new Error(`index.html: not found ${from}`);
  html = html.replace(from, to);
};
replace(/\s*<link rel="manifest"[^>]*>/, '');
replace(/\s*<link rel="apple-touch-icon"[^>]*>/, '');
replace(/\s*<link rel="preconnect"[^>]*>/, '');
replace(/\s*<link rel="preconnect"[^>]*>/, '');
replace(/\s*<link href="https:\/\/fonts.googleapis.com[^>]*>/, '');
replace('  <style>\n', `  <style>\n${fontCss}\n`);
// Keep the game clear of the notch / Dynamic Island and the home indicator (iOS).
// On Android the WebView itself is laid out between the system bars (see
// capacitor.config.json android.adjustMarginsForEdgeToEdge), so these insets are 0 there.
replace('    #game { width: 100%; height: 100%; }', [
  '    #game {',
  '      position: fixed; left: 0; right: 0;',
  '      top: env(safe-area-inset-top); bottom: env(safe-area-inset-bottom);',
  '    }',
].join('\n'));
replace('<script src="https://cdn.jsdelivr.net/npm/phaser@3.60.0/dist/phaser.min.js"></script>', '<script src="vendor/phaser.min.js"></script>');
replace('<script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>', [
  '<script src="vendor/socket.io.min.js"></script>',
  `  <script>window.RPS_SERVER = ${JSON.stringify(SERVER)};</script>`,
].join('\n'));
if (/https?:\/\/(cdn|fonts)\./.test(html)) throw new Error('index.html still references a CDN');
fs.writeFileSync(path.join(out, 'index.html'), html);

console.log(`Built ${path.relative(root, out)} → server ${SERVER}`);
