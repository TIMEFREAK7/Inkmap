// Backfill from photos: points (lat, lon, day) -> suggested trips. Pure, so the places worker and the tests share it.
import { addDays } from './dates.js';

export const AIRPORT_KM = 3; // photos this close to an airport are skipped: a layover is not a visit
export const HOME_KM = 25; // photos around your home town (suburbs included) are everyday life, not trips
const REACH_KM = 25;

export const km = (aLat, aLon, bLat, bLon) => {
  const x = ((bLon - aLon) * Math.PI / 180) * Math.cos(((aLat + bLat) / 2) * Math.PI / 180);
  const y = (bLat - aLat) * Math.PI / 180;
  return Math.hypot(x, y) * 6371;
};

// 1° cells; a lookup reads the 3×3 cells around a point.
export function gridOf(items) {
  const grid = new Map();
  for (const it of items) {
    const k = `${Math.floor(it.lat)},${Math.floor(it.lon)}`;
    (grid.get(k) || grid.set(k, []).get(k)).push(it);
  }
  return grid;
}

function* around(grid, lat, lon) {
  const la = Math.floor(lat), lo = Math.floor(lon);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const wrapped = ((lo + j + 180 + 360) % 360) - 180;
    yield* grid.get(`${la + i},${wrapped}`) || [];
  }
}

export const nearAirport = (airports, lat, lon) => {
  for (const a of around(airports, lat, lon)) if (km(lat, lon, a.lat, a.lon) < AIRPORT_KM) return true;
  return false;
};

// Big places reach further: a photo in a Delhi neighbourhood counts as Delhi, while one taken in a separate town
// next to a big city counts as that town. Score = population / (distance + 1 km)².
export function cityAt(places, lat, lon) {
  let best = null, bestScore = 0;
  for (const p of around(places, lat, lon)) {
    if (p.section) continue; // city sections (Karol Bagh) count as their city
    const d = km(lat, lon, p.lat, p.lon);
    if (d > REACH_KM) continue;
    const score = Math.max(p.pop, 500) / (d + 1) ** 2;
    if (score > bestScore) { best = p; bestScore = score; }
  }
  return best;
}

// One trip per city per run of consecutive days with photos there.
export function photoTrips(points, places, airports, home) {
  const byCity = new Map();
  let skipped = 0;
  for (const pt of points) {
    if (home && km(pt.lat, pt.lon, home.lat, home.lon) < HOME_KM) { skipped++; continue; }
    if (nearAirport(airports, pt.lat, pt.lon)) { skipped++; continue; }
    const place = cityAt(places, pt.lat, pt.lon);
    if (!place) { skipped++; continue; }
    const c = byCity.get(place.id) || byCity.set(place.id, { place, days: new Map() }).get(place.id);
    c.days.set(pt.day, (c.days.get(pt.day) || 0) + 1);
  }
  const trips = [];
  for (const { place, days } of byCity.values()) {
    let trip = null;
    for (const day of [...days.keys()].sort()) {
      if (trip && addDays(trip.dateTo, 1) === day) trip.dateTo = day;
      else trips.push(trip = { place, dateFrom: day, dateTo: day, photos: 0 });
      trip.photos += days.get(day);
    }
  }
  return { trips: trips.sort((a, b) => b.dateFrom.localeCompare(a.dateFrom)), skipped };
}

// Drop trips already logged as visits or already suggested (rejected ones too, so they never come back).
export function unseenTrips(trips, visits, suggestions) {
  const overlaps = (t, o) => o.geonameId === t.place.id && t.dateFrom <= (o.dateTo || o.dateFrom) && t.dateTo >= o.dateFrom;
  return trips.filter(t => !visits.some(v => overlaps(t, v)) && !suggestions.some(s => overlaps(t, s)));
}
