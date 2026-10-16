// Google Maps Timeline import: places the person stayed -> points { lat, lon, day }, one per day of each stay.
// Three export shapes are read (Google has changed it before):
//   Android on-device export:  { semanticSegments: [{ startTime, endTime, visit: { topCandidate: { placeLocation: { latLng: "18.52°, 73.85°" } } } }] }
//   iPhone export:             [{ startTime, endTime, visit: { topCandidate: { placeLocation: "geo:18.52,73.85" } } }]
//   Older Takeout (monthly):   { timelineObjects: [{ placeVisit: { location: { latitudeE7, longitudeE7 }, duration: { startTimestamp, endTimestamp } } }] }
import { addDays } from './dates.js';

const MAX_DAYS = 60; // a longer "visit" is the export misreading a home or office, not a trip
const NUMBERS = /(-?\d+(?:\.\d+)?)\D+?(-?\d+(?:\.\d+)?)/;

const latLon = v => {
  const m = typeof v === 'string' && v.match(NUMBERS);
  return m && { lat: +m[1], lon: +m[2] };
};
// The phone exports write local times with their offset ("2024-05-01T10:00:00.000+05:30"), so the date part is the local day.
// shortcut: older Takeout files are in UTC ("...Z"), so a stay just after midnight local time can land on the day before.
const day = t => (typeof t === 'string' && /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : null);

function visits(json) {
  if (Array.isArray(json?.semanticSegments)) {
    return json.semanticSegments.filter(s => s?.visit).map(s => ({ at: latLon(s.visit.topCandidate?.placeLocation?.latLng), from: s.startTime, to: s.endTime }));
  }
  if (Array.isArray(json?.timelineObjects)) {
    return json.timelineObjects.filter(o => o?.placeVisit).map(({ placeVisit: v }) => ({
      at: v.location && { lat: v.location.latitudeE7 / 1e7, lon: v.location.longitudeE7 / 1e7 },
      from: v.duration?.startTimestamp ?? (v.duration?.startTimestampMs && new Date(+v.duration.startTimestampMs).toISOString()),
      to: v.duration?.endTimestamp ?? (v.duration?.endTimestampMs && new Date(+v.duration.endTimestampMs).toISOString()),
    }));
  }
  if (Array.isArray(json)) {
    return json.filter(s => s?.visit).map(s => ({ at: latLon(s.visit.topCandidate?.placeLocation), from: s.startTime, to: s.endTime }));
  }
  return null;
}

// Throws if the file isn't a Timeline export at all; skips any single entry it can't read.
export function parseTimeline(text) {
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  const list = visits(json);
  if (!list) throw new Error("This isn't a Google Maps Timeline file. Export it from Timeline on your phone and pick the .json file.");
  const points = [];
  for (const v of list) {
    const from = day(v.from), to = day(v.to) || from;
    const { lat, lon } = v.at || {};
    if (!from || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    for (let d = from, n = 0; d <= to && n < MAX_DAYS; d = addDays(d, 1), n++) points.push({ lat, lon, day: d });
  }
  return { points, visits: list.length };
}
