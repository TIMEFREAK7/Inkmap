// Renders every app icon and splash image from resources/icon-foreground.svg (run after changing the mark):
//   node scripts/icons.mjs   (needs the playwright package and a Chromium; not an app dependency)
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname } from 'node:path';

const mark = readFileSync('resources/icon-foreground.svg', 'utf8').replace(/<!--[\s\S]*?-->/g, '');
const BG = 'radial-gradient(circle at 30% 25%, #22306a, #0b1026 90%)';
const RES = 'android/app/src/main/res';
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const page = await browser.newPage();
async function render(file, w, h, { bg = BG, shape = '', markSize = Math.min(w, h) } = {}) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<body style="margin:0;width:${w}px;height:${h}px;display:flex;align-items:center;justify-content:center;
    background:${bg};${shape}">${mark.replace('<svg ', `<svg width="${markSize}" height="${markSize}" `)}</body>`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, await page.screenshot({ omitBackground: true }));
}
const clear = 'transparent';

for (const [d, k] of Object.entries(DENSITIES)) {
  await render(`${RES}/mipmap-${d}/ic_launcher_foreground.png`, 108 * k, 108 * k, { bg: clear }); // adaptive icon layer
  await render(`${RES}/mipmap-${d}/ic_launcher.png`, 48 * k, 48 * k, { shape: 'border-radius:22%' }); // Android 7
  await render(`${RES}/mipmap-${d}/ic_launcher_round.png`, 48 * k, 48 * k, { shape: 'border-radius:50%' });
}
// Splash images (Android 7–11 show these; 12+ shows the icon on the night-blue background set in styles.xml).
for (const dir of readdirSync(RES).filter(d => d.startsWith('drawable'))) {
  const file = `${RES}/${dir}/splash.png`;
  try { readFileSync(file); } catch { continue; }
  const [w, h] = [readFileSync(file).readUInt32BE(16), readFileSync(file).readUInt32BE(20)]; // PNG header size
  await render(file, w, h, { bg: '#0b1026', markSize: Math.round(Math.min(w, h) * 0.45) });
}
// Web and PWA, Windows installer.
await render('public/icon-192.png', 192, 192);
await render('public/icon-512.png', 512, 512);
await render('public/icon-maskable-512.png', 512, 512, { markSize: 400 }); // maskable: the mark inside the safe circle
await render('public/apple-touch-icon.png', 180, 180);
await render('public/favicon.png', 64, 64, { shape: 'border-radius:22%' });
await render('build/icon.png', 512, 512, { shape: 'border-radius:22%' });
await browser.close();
console.log('icons written');
