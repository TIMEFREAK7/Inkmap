import { feature } from 'topojson-client';

// Relative URLs so the same build works from Vercel, Capacitor (https://localhost) and Electron (file://).
const url = name => `${import.meta.env.BASE_URL}data/${name}`;

export async function loadCountries() {
  const [list, topo] = await Promise.all([
    fetch(url('countries.json')).then(r => r.json()),
    fetch(url('countries.topo.json')).then(r => r.json()),
  ]);
  const byCode = Object.fromEntries(list.map(c => [c.code, c]));
  const geo = feature(topo, topo.objects.countries);
  for (const f of geo.features) f.properties.continent = byCode[f.properties.iso]?.continent;
  return { list, byCode, geo };
}

// Columns: id name ascii lat lon cc admin1 pop alts (see data-pipeline/build.mjs).
export function parsePlaces(text) {
  const lines = text.split('\n');
  const places = new Array(lines.length - 2);
  let n = 0;
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i];
    if (!l) continue;
    const f = l.split('\t');
    places[n++] = {
      id: +f[0], name: f[1], ascii: f[2] || f[1], lat: +f[3], lon: +f[4],
      cc: f[5], admin1: f[6], pop: +f[7], alts: f[8] ? f[8].split('|') : [],
    };
  }
  places.length = n;
  return places;
}

// shortcut: the worker only reports the count for the Tier 0 screen; Tier 1 search will query places inside it.
export function loadPlaces() {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./places.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = e => { resolve(e.data); worker.terminate(); };
    worker.onerror = e => { reject(new Error(e.message || 'places worker failed')); worker.terminate(); };
    worker.postMessage(new URL(url('places.tsv'), document.baseURI).href); // absolute: the worker's own base is assets/
  });
}
