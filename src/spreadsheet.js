// A trip list someone kept in Excel (.xlsx) or a CSV: one trip per row, with a place and a date somewhere in it.
// Column order and headings differ in every sheet, so columns are recognised by what's in them.
// No library: .xlsx is a zip of XML files, unzipped with the browser's own DecompressionStream.
import { norm } from './search.js';
import { addDays } from './dates.js';

const MAX_DAYS = 60; // a longer row is a "lived there" period, not a trip

// --- Reading the file -> sheets of rows of cells (strings, or numbers from Excel number/date cells) ---

export async function readSheet(file) {
  if (file.size > 20e6) throw new Error('That file is too big for a trip list.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return readXlsx(bytes); // "PK": a zip
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf) throw new Error('This is an old Excel file (.xls). In Excel, choose Save As → Excel Workbook (.xlsx) or CSV, then pick that file.');
  return { sheets: [parseCsv(new TextDecoder().decode(bytes))], date1904: false };
}

// Quotes, doubled quotes and line breaks inside quotes; comma, semicolon (European Excel) or tab, whichever the first line uses.
export function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const first = text.slice(0, text.indexOf('\n') >>> 0);
  const sep = [',', ';', '\t'].reduce((a, b) => (first.split(b).length > first.split(a).length ? b : a));
  const rows = [[]];
  let cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { rows.at(-1).push(cell); cell = ''; } else if (ch === '\n') { rows.at(-1).push(cell.replace(/\r$/, '')); rows.push([]); cell = ''; } else cell += ch;
  }
  rows.at(-1).push(cell);
  return rows;
}

async function unzip(bytes, wanted) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= 0 && v.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw new Error('This file is damaged or is not an Excel file.');
  const files = new Map();
  for (let p = v.getUint32(end + 16, true), n = v.getUint16(end + 10, true); n > 0; n--) {
    const method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true), skip = nameLen + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    const local = v.getUint32(p + 42, true);
    p += 46 + skip;
    if (!wanted(name)) continue;
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const raw = bytes.subarray(start, start + size);
    files.set(name, method === 0 ? new TextDecoder().decode(raw)
      : await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text());
  }
  return files;
}

const XML = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unescape = s => s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : XML[e] ?? m));
const texts = xml => [...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(m => unescape(m[1])).join('');
const column = ref => [...ref.replace(/\d+/g, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

// Every sheet (some people keep a sheet per year, and the columns can differ between them).
async function readXlsx(bytes) {
  const files = await unzip(bytes, n => n === 'xl/sharedStrings.xml' || n === 'xl/workbook.xml' || /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  const shared = [...(files.get('xl/sharedStrings.xml') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => texts(m[1]));
  const date1904 = /date1904="(1|true)"/.test(files.get('xl/workbook.xml') ?? '');
  const sheets = [...files.keys()].filter(n => n.includes('worksheets/')).sort((a, b) => a.match(/\d+/g).at(-1) - b.match(/\d+/g).at(-1));
  return { sheets: sheets.map(name => {
    const rows = [];
    for (const [, row] of files.get(name).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = [];
      for (const [, attrs, body = ''] of row.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const type = attrs.match(/\bt="(\w+)"/)?.[1], value = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        cells[column(attrs.match(/\br="([A-Z]+\d+)"/)?.[1] ?? 'A1')] =
          type === 's' ? shared[+value] ?? '' : type === 'inlineStr' ? texts(body) : type === 'str' || type === 'b' ? unescape(value ?? '')
          : value != null ? +value : '';
      }
      rows.push(Array.from(cells, c => c ?? ''));
    }
    return rows;
  }), date1904 };
}

// --- Dates ---

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const month = s => MONTHS.indexOf(norm(s).slice(0, 3)) + 1;
const pad = n => String(n).padStart(2, '0');

function ymd(y, m, d) {
  if (y < 100) y += y > new Date().getFullYear() % 100 ? 1900 : 2000;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (y < 1900 || date > new Date() || date.getUTCMonth() !== m - 1) return null; // 31 Feb, the future
  return `${y}-${pad(m)}-${pad(d)}`;
}

// -> 'YYYY-MM-DD' or null. A month alone is its 1st, a year alone is 1 January.
// mdy: the column writes 03/12 as March 12 (US); otherwise day first, as in India and most of the world.
export function parseDay(v, { mdy = false, date1904 = false } = {}) {
  if (typeof v === 'number') {
    if (Number.isInteger(v) && v >= 1900 && v <= 2100) return ymd(v, 1, 1);
    if (v < 1 || v > 80000) return null;
    return new Date(Date.UTC(1899, 11, 30) + (Math.floor(v) + (date1904 ? 1462 : 0)) * 86400000).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m;
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/))) return ymd(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})\b/))) return mdy ? ymd(+m[3], +m[1], +m[2]) : ymd(+m[3], +m[2], +m[1]);
  if ((m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s.-]+([a-z]{3,})\.?[\s,.-]+(\d{2}|\d{4})$/i)) && month(m[2])) return ymd(+m[3], month(m[2]), +m[1]);
  if ((m = s.match(/^([a-z]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/i)) && month(m[1])) return ymd(+m[3], month(m[1]), +m[2]);
  if ((m = s.match(/^([a-z]{3,})\.?[\s,'-]+(\d{2}|\d{4})$/i)) && month(m[1])) return ymd(+m[2], month(m[1]), 1);
  if ((m = s.match(/^(\d{4})$/))) return ymd(+m[1], 1, 1);
  return null;
}

// --- Rows -> trips ---

const PLACE = /city|place|destination|location|town|where|visit|trip|stay|\bto\b/i;
const FROM = /from|start|arriv|date|when|year|\bon\b/i;
const TO = /\bto\b|till|until|end|return|back/i;
const SPLIT = /[,;/|\n&+]|\s[-–—]\s|\s(?:to|and)\s|→|->/i; // "Delhi - Agra - Jaipur", "Paris, France"

// countryCodes: normalised country name -> code. -> { trips: [{ parts, country, days }], undated }
// parts: the place cell split into names; country: the name from the country column, if any.
export function sheetTrips(rows, countryCodes, date1904 = false) {
  rows = rows.map(r => r.map(c => (typeof c === 'string' ? c.trim() : c)));
  const filled = r => r.filter(c => c !== '').length;
  const width = Math.max(0, ...rows.map(r => r.length));
  // A heading row: words, none of them a date (each sheet may repeat its own)
  const isHeading = r => filled(r) >= 2 && r.every(c => c === '' || (typeof c === 'string' && !parseDay(c) && !/^\d+$/.test(c)))
    && r.some(c => PLACE.test(c) || FROM.test(c) || /country/i.test(c));
  const heading = rows.find(isHeading) ?? [];
  const data = rows.filter(r => filled(r) && !isHeading(r));

  const cells = c => data.map(r => r[c] ?? '').filter(x => x !== '');
  const mdy = [], dateShare = [], countryShare = [], textShare = [];
  for (let c = 0; c < width; c++) {
    const vals = cells(c);
    const pairs = vals.map(x => String(x).match(/^(\d{1,2})[-/.](\d{1,2})[-/.]\d/)).filter(Boolean);
    mdy[c] = pairs.some(p => +p[2] > 12) && !pairs.some(p => +p[1] > 12);
    const share = f => (vals.length ? vals.filter(f).length / vals.length : 0);
    dateShare[c] = share(x => parseDay(x, { mdy: mdy[c], date1904 }) && !(typeof x === 'number' && x < 1900 && !/date|when|on/i.test(heading[c] ?? '')));
    countryShare[c] = share(x => typeof x === 'string' && countryCodes[norm(x)]);
    textShare[c] = share(x => typeof x === 'string' && /\p{L}{3}/u.test(x) && !parseDay(x));
  }
  const cols = [...Array(width).keys()];
  const dates = cols.filter(c => dateShare[c] >= 0.6);
  const from = dates.find(c => FROM.test(heading[c] ?? '') && !TO.test(heading[c] ?? '')) ?? dates[0];
  const to = dates.find(c => c !== from && TO.test(heading[c] ?? '')) ?? dates.find(c => c !== from);
  const countryCol = cols.find(c => countryShare[c] >= 0.5);
  const texts = cols.filter(c => c !== countryCol && !dates.includes(c) && textShare[c] >= 0.5);
  const placeCol = texts.find(c => PLACE.test(heading[c] ?? '')) ?? texts[0];

  const trips = [];
  let undated = 0;
  for (const r of data) {
    const start = from == null ? null : parseDay(r[from], { mdy: mdy[from], date1904 });
    let end = to == null ? null : parseDay(r[to], { mdy: mdy[to], date1904 });
    const parts = String(r[placeCol] ?? '').split(SPLIT).map(s => s.trim()).filter(s => s.length >= 2);
    const country = countryCol == null ? '' : String(r[countryCol] ?? '');
    if (!parts.length && !country) continue;
    if (!start) { undated++; continue; }
    if (!end || end < start) end = start;
    const days = [];
    for (let d = start; d <= end && days.length < MAX_DAYS; d = addDays(d, 1)) days.push(d);
    trips.push({ parts, country, days });
  }
  return { trips, undated };
}

// Normalised country name -> code, with the short names people actually write.
const ALIASES = { usa: 'US', us: 'US', america: 'US', 'united states of america': 'US', uk: 'GB', england: 'GB', scotland: 'GB', wales: 'GB',
  'great britain': 'GB', britain: 'GB', uae: 'AE', emirates: 'AE', korea: 'KR', holland: 'NL', netherlands: 'NL', 'czech republic': 'CZ' };
export const countryNames = countries => ({ ...ALIASES, ...Object.fromEntries(countries.list.map(c => [norm(c.name), c.code])) });
