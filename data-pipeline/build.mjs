// Builds the bundled reference data in public/data from the raw downloads (see fetch.sh).
// Usage: node data-pipeline/build.mjs [rawDir]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.resolve(process.argv[2] || path.join(here, '.raw'));
const OUT = path.join(here, '..', 'public', 'data');
const MAPSHAPER = path.join(here, '..', 'node_modules', '.bin', 'mapshaper');
fs.mkdirSync(OUT, { recursive: true });

// Minimal CSV line parser: quoted fields with "" escapes, no embedded newlines (true for both sources).
export function parseCsvLine(line) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function readCsv(file) {
  const [head, ...rows] = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(parseCsvLine);
  return rows.map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

// --- Countries and continents (UN M49 -> 7 continents) ---
export function m49Continent(region, subRegion, intermediate) {
  if (region === 'Americas') {
    if (subRegion === 'Northern America') return 'North America';
    return intermediate === 'South America' ? 'South America' : 'North America';
  }
  if (!region) return 'Antarctica'; // M49 lists Antarctica with no region
  return region; // Africa, Asia, Europe, Oceania
}

// Entries GeoNames uses that M49 does not list.
const EXTRA = { TW: 'Asia', XK: 'Europe' };

function buildCountries() {
  const geoNames = {};
  for (const l of fs.readFileSync(path.join(RAW, 'countryInfo.txt'), 'utf8').split('\n')) {
    if (!l || l.startsWith('#')) continue;
    const f = l.split('\t');
    geoNames[f[0]] = f[4];
  }
  const countries = readCsv(path.join(here, 'sources', 'm49.csv')).map(r => ({
    code: r['ISO-alpha2 Code'],
    name: geoNames[r['ISO-alpha2 Code']] || r['Country or Area'],
    continent: m49Continent(r['Region Name'], r['Sub-region Name'], r['Intermediate Region Name']),
  }));
  for (const [code, continent] of Object.entries(EXTRA)) countries.push({ code, name: geoNames[code], continent });
  countries.sort((a, b) => a.code.localeCompare(b.code));
  return countries;
}

// --- Places (GeoNames cities1000) ---
// Starts with a capital: GeoNames' all-lowercase entries are machine romanisations nobody types ("bmbyy").
const LATIN = /^\p{Lu}[\p{Script=Latin} '’.\-]*$/u;
const norm = s => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

// Keep alternate names a person might type: Latin script, no codes or digits. Bombay stays, BOM goes.
export function trimAltNames(raw, name, ascii) {
  const seen = new Set([norm(name), norm(ascii)]);
  const keep = [];
  for (const a of raw ? raw.split(',') : []) {
    if (a.length < 3 || a.length > 40 || !LATIN.test(a) || /^[A-Z]{3,4}$/.test(a)) continue;
    const n = norm(a);
    if (seen.has(n)) continue;
    seen.add(n);
    keep.push(a);
  }
  return keep;
}

function buildPlaces(codes) {
  const lines = [];
  const dropped = {};
  for (const l of fs.readFileSync(path.join(RAW, 'cities1000', 'cities1000.txt'), 'utf8').split('\n')) {
    if (!l) continue;
    const f = l.split('\t');
    const [id, name, ascii, alts, lat, lon] = f;
    const cc = f[8], admin1 = f[10], pop = f[14];
    if (!codes.has(cc)) { dropped[cc] = (dropped[cc] || 0) + 1; continue; }
    lines.push([id, name, ascii === name ? '' : ascii, (+lat).toFixed(4), (+lon).toFixed(4), cc, admin1, pop,
      trimAltNames(alts, name, ascii).join('|')].join('\t'));
  }
  if (Object.keys(dropped).length) console.warn('Places dropped (country not in list):', dropped);
  // Header line documents the column order for the app's parser.
  fs.writeFileSync(path.join(OUT, 'places.tsv'), 'id\tname\tascii\tlat\tlon\tcc\tadmin1\tpop\talts\n' + lines.join('\n') + '\n');
  return lines.length;
}

// --- Boundaries (Natural Earth -> simplified TopoJSON) ---
// Natural Earth splits some disputed or special areas off; give the inhabited ones to the country GeoNames uses.
const UNIT_FIX = { SOL: 'SO', CYN: 'CY', CNM: 'CY', ESB: 'CY', WSB: 'CY', KOR: 'KR', PRK: 'KP', USG: 'CU', SYR: 'SY' };

function mapshaper(...args) {
  execFileSync(MAPSHAPER, ['-quiet', ...args], { stdio: 'inherit' });
}

function buildBoundaries(codes) {
  const mu = path.join(RAW, 'ne_10m_admin_0_map_units', 'ne_10m_admin_0_map_units.shp');
  const um = path.join(RAW, 'ne_10m_admin_0_countries', 'ne_10m_admin_0_countries.shp');
  const fix = JSON.stringify(UNIT_FIX);
  const codeList = JSON.stringify([...codes]);
  mapshaper(
    '-i', mu, um, 'combine-files',
    '-filter', 'ISO_A2 === "UM"', 'target=ne_10m_admin_0_countries',
    '-merge-layers', 'target=*', 'force',
    '-each', `iso = ${fix}[ADM0_A3] || (ISO_A2_EH !== "-99" ? ISO_A2_EH : ISO_A2)`,
    '-filter', `${codeList}.indexOf(iso) > -1`,
    '-dissolve2', 'iso',
    '-simplify', '6%', 'keep-shapes',
    '-rename-layers', 'countries',
    '-o', path.join(OUT, 'countries.topo.json'), 'format=topojson', 'quantization=100000',
  );
  const topo = JSON.parse(fs.readFileSync(path.join(OUT, 'countries.topo.json'), 'utf8'));
  const have = new Set(topo.objects.countries.geometries.map(g => g.properties.iso));
  return [...codes].filter(c => !have.has(c));
}

// --- States and districts per country (geoBoundaries, fetched by fetch-boundaries.mjs) ---
// One file per country, loaded only when that country's view opens. Layers: adm1 (states), adm2 (districts).
const GB = path.join(RAW, 'gb');
const ISO3_EXTRA = { TW: 'TWN', XK: 'XKX' };
const run = promisify(execFile);

async function buildRegions(countries) {
  const meta = JSON.parse(fs.readFileSync(path.join(GB, 'meta.json'), 'utf8'));
  const iso3 = Object.fromEntries(readCsv(path.join(here, 'sources', 'm49.csv')).map(r => [r['ISO-alpha2 Code'], r['ISO-alpha3 Code']]));
  Object.assign(iso3, ISO3_EXTRA);
  const dir = path.join(OUT, 'regions');
  fs.mkdirSync(dir, { recursive: true });
  const sources = {};
  const jobs = countries.map(c => c.code).filter(cc => {
    const levels = ['ADM1', 'ADM2'].filter(l => fs.existsSync(path.join(GB, `${iso3[cc]}-${l}.json`)));
    if (!levels.length) return false;
    sources[cc] = levels.map(l => {
      const m = meta.find(x => x.iso3 === iso3[cc] && x.level === l);
      return { level: l === 'ADM1' ? 'adm1' : 'adm2', unit: m.unit, license: m.license, source: m.source };
    });
    return true;
  });
  let done = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (let cc; (cc = jobs.shift());) {
      const out = path.join(dir, `${cc}.json`);
      const inputs = sources[cc].map(s => {
        const file = path.join(GB, `${iso3[cc]}-${s.level.toUpperCase()}.json`);
        const simplified = file.replace('.json', '.simplified.json'); // only fetched for huge sources
        return fs.existsSync(simplified) ? simplified : file;
      });
      if (!fs.existsSync(out)) {
        // 150 m: borders stay true at city zoom; finer only grew files (France 5 MB here, 7.5 MB at 50 m).
        await run(MAPSHAPER, ['-quiet', '-i', ...inputs, ...(inputs.length > 1 ? ['combine-files'] : []),
          '-rename-layers', sources[cc].map(s => s.level).join(','), 'target=*',
          '-filter-fields', 'shapeName', 'target=*',
          '-simplify', 'interval=150', 'keep-shapes', 'target=*',
          '-o', out, 'format=topojson', 'quantization=1000000', 'target=*'], { maxBuffer: 1 << 26 });
      }
      if (++done % 20 === 0) console.log(`regions ${done}`);
    }
  }));
  fs.writeFileSync(path.join(OUT, 'boundary-sources.json'), JSON.stringify(sources));
  return Object.keys(sources).length;
}

// --- State/province names (GeoNames admin1), to tell same-named places apart in search ---
function buildAdmin1() {
  const names = {};
  for (const l of fs.readFileSync(path.join(RAW, 'admin1CodesASCII.txt'), 'utf8').split('\n')) {
    const [code, name] = l.split('\t');
    if (name) names[code] = name; // "IN.16" -> "Maharashtra"
  }
  fs.writeFileSync(path.join(OUT, 'admin1.json'), JSON.stringify(names));
  return Object.keys(names).length;
}

// --- Airports (OurAirports) ---
function buildAirports() {
  const rows = readCsv(path.join(RAW, 'airports.csv'))
    .filter(r => r.iata_code && /^[A-Z]{3}$/.test(r.iata_code) && (r.type === 'large_airport' || r.type === 'medium_airport' || r.scheduled_service === 'yes'))
    .map(r => [r.iata_code, r.name, (+r.latitude_deg).toFixed(4), (+r.longitude_deg).toFixed(4), r.iso_country, r.municipality].join('\t'));
  fs.writeFileSync(path.join(OUT, 'airports.tsv'), 'iata\tname\tlat\tlon\tcc\tcity\n' + rows.join('\n') + '\n');
  return rows.length;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const countries = buildCountries();
  fs.writeFileSync(path.join(OUT, 'countries.json'), JSON.stringify(countries));
  const codes = new Set(countries.map(c => c.code));
  const places = buildPlaces(codes);
  const missing = buildBoundaries(codes);
  const regions = await buildRegions(countries);
  const airports = buildAirports();
  const admin1 = buildAdmin1();
  console.log(`countries: ${countries.length}, places: ${places}, airports: ${airports}, admin1: ${admin1}, countries with states/districts: ${regions}`);
  // Tiny entries with no Natural Earth shape still count; they just can't be shaded on the map.
  console.log('No boundary shape for:', missing.join(', ') || 'none');
  for (const f of fs.readdirSync(OUT)) if (f !== 'regions') console.log(`${f}: ${(fs.statSync(path.join(OUT, f)).size / 1048576).toFixed(2)} MB`);
  const regionBytes = fs.readdirSync(path.join(OUT, 'regions')).reduce((a, f) => a + fs.statSync(path.join(OUT, 'regions', f)).size, 0);
  console.log(`regions/: ${(regionBytes / 1048576).toFixed(1)} MB`);
}
