import { feature } from 'topojson-client';

// Relative URLs so the same build works from Vercel, Capacitor (https://localhost) and Electron (file://).
const url = name => `${import.meta.env.BASE_URL}data/${name}`;

export async function loadCountries() {
  const [list, topo, admin1] = await Promise.all([
    fetch(url('countries.json')).then(r => r.json()),
    fetch(url('countries.topo.json')).then(r => r.json()),
    fetch(url('admin1.json')).then(r => r.json()),
  ]);
  const byCode = Object.fromEntries(list.map(c => [c.code, c]));
  const geo = feature(topo, topo.objects.countries);
  for (const f of geo.features) f.properties.continent = byCode[f.properties.iso]?.continent;
  return { list, byCode, geo, admin1 };
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

// Starts the places worker. Resolves once the index is built; then search(query) answers in the background.
export function startPlaces() {
  const worker = new Worker(new URL('./places.worker.js', import.meta.url), { type: 'module' });
  const pending = new Map();
  let seq = 0;
  const ask = msg => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    worker.postMessage({ ...msg, id });
  });
  worker.onmessage = ({ data }) => {
    pending.get(data.id)?.resolve(data);
    pending.delete(data.id);
  };
  worker.onerror = e => {
    for (const p of pending.values()) p.reject(new Error(e.message || 'places worker failed'));
    pending.clear();
  };
  // Absolute URL: the worker's own base is assets/.
  return ask({ type: 'load', url: new URL(url('places.tsv'), document.baseURI).href }).then(({ count, ms }) => ({
    count, ms,
    search: query => ask({ type: 'search', query }).then(r => r.results),
  }));
}
