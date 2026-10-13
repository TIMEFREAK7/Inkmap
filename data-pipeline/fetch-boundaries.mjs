// Downloads geoBoundaries (gbOpen) state (ADM1) and district (ADM2) boundaries for every country in the app,
// plus each file's licence and source, into data-pipeline/.raw/gb. Then run: npm run data
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '.raw', 'gb');
fs.mkdirSync(OUT, { recursive: true });

// GitHub's raw URLs redirect large files to Git LFS; the media host serves them directly.
const media = url => url.replace('https://github.com/wmgeolab/geoBoundaries/raw/', 'https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/');

async function getJson(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return await r.json();
    } catch (e) {
      if (attempt === 4) throw e;
      await new Promise(res => setTimeout(res, 2000 * attempt));
    }
  }
}

async function download(url, file) {
  if (fs.existsSync(file)) return;
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      fs.writeFileSync(file + '.part', Buffer.from(await r.arrayBuffer()));
      fs.renameSync(file + '.part', file);
      return;
    } catch (e) {
      if (attempt === 4) throw e;
      await new Promise(res => setTimeout(res, 2000 * attempt));
    }
  }
}

const meta = [];
for (const level of ['ADM1', 'ADM2']) {
  for (const b of await getJson(`https://www.geoboundaries.org/api/current/gbOpen/ALL/${level}/`)) {
    meta.push({
      iso3: b.boundaryISO, level, unit: b.boundaryCanonical || '', license: b.boundaryLicense,
      source: b.boundarySource, url: media(b.tjDownloadURL), simplifiedUrl: media(b.simplifiedGeometryGeoJSON),
    });
  }
}
fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify(meta, null, 1));

let done = 0;
const queue = [...meta];
await Promise.all(Array.from({ length: 6 }, async () => {
  for (let m; (m = queue.shift());) {
    await download(m.url, path.join(OUT, `${m.iso3}-${m.level}.json`)).catch(e => console.warn('skipped', m.iso3, m.level, e.message));
    if (++done % 50 === 0) console.log(`${done}/${meta.length}`);
  }
}));
// A few sources are survey-grade (Canada 141 MB, the Philippines 95 MB) and take mapshaper over half an hour.
// For those, also fetch geoBoundaries' own simplified copy; build.mjs starts from it instead.
const HUGE = 50 * 1048576;
for (const m of meta) {
  const file = path.join(OUT, `${m.iso3}-${m.level}.json`);
  if (fs.existsSync(file) && fs.statSync(file).size > HUGE) await download(m.simplifiedUrl, file.replace('.json', '.simplified.json'));
}
console.log(`geoBoundaries ready: ${meta.length} files in ${OUT}`);
