// Calendar import: events with a place (hotel stays, trips) and flights -> what to look up for each.
// Gmail and airline apps add flights to the calendar ("Flight to Delhi (AI 860)", location = departure airport),
// so for a flight the destination comes from the title; for anything else, from the event's location.
import { norm } from './search.js';

const MAX_DAYS = 14; // a longer event is a reminder or a whole-trip block, not a stay in one place

// -> { iata } for a flight to an airport code, { text } to find a place by name, or null.
export function eventQuery(e) {
  const title = e.title || '';
  const codes = title.match(/\b([A-Z]{3})\s*(?:-|–|—|→|>|to)\s*([A-Z]{3})\b/);
  if (codes) return { iata: codes[2] };
  const to = title.match(/\bflight to\s+(.+?)(?:\s*[(\[,]|$)/i);
  if (to) return { text: to[1] };
  if (/\bflight\b/i.test(title)) return null; // a flight without a readable destination: its location is where it leaves from
  return e.location?.trim() ? { text: e.location } : null;
}

// Each day of an event, capped.
export function eventDays(e) {
  const days = [];
  for (let d = new Date(e.from + 'T00:00:00Z'), n = 0; d.toISOString().slice(0, 10) <= (e.to || e.from) && n < MAX_DAYS; d.setUTCDate(d.getUTCDate() + 1), n++) {
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

// "Taj Mahal Palace, Apollo Bandar, Colaba, Mumbai, Maharashtra 400001, India" -> Mumbai.
// Reads the address from the end (country, state, city, street): the first part that is exactly a place's name wins,
// so the city is found before its neighbourhoods. lookup(name) -> search results; countryCodes: normalised name -> code.
export async function placeFromText(text, lookup, countryCodes) {
  const parts = text.split(/[,\n;|]/).map(p => p.replace(/[\d#]+/g, ' ').replace(/\s+/g, ' ').trim()).filter(p => p.length >= 3);
  let cc = null;
  for (const part of parts.reverse()) {
    const n = norm(part);
    if (countryCodes[n]) { cc = countryCodes[n]; continue; }
    const exact = (await lookup(part)).filter(p => !p.section && (!cc || p.cc === cc)
      && (norm(p.name) === n || norm(p.ascii) === n || p.alts.some(a => norm(a) === n)));
    if (exact.length) return exact.reduce((a, b) => (b.pop > a.pop ? b : a));
  }
  return null;
}
