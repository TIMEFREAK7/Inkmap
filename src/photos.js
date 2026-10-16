// Photo backfill: read place and date from photos, turn them into suggestions for the inbox.
// Only coordinates and days are read; photos are never copied or kept.
import { Capacitor } from '@capacitor/core';
import exifr from 'exifr';
import { db } from './db.js';
import { PhotoScan, Calendar } from './native.js';
import { makeVisit } from './visits.js';
import { unseenTrips, km, HOME_KM } from './backfill.js';
import { parseBoardingPass } from './boardingPass.js';
import { today } from './dates.js';
import { parseTimeline } from './timeline.js';
import { eventQuery, eventDays, placeFromText } from './calendar.js';
import { norm } from './search.js';

// Android scans the whole library (the photo picker strips location); elsewhere the person picks files.
export const scansLibrary = Capacitor.isNativePlatform();

// folder: read a folder the person picks instead of the media index (which can miss files on some phones).
async function readLibrary(after, folder, onProgress) {
  const listener = await PhotoScan.addListener('progress', onProgress);
  try {
    return await (folder ? PhotoScan.scanFolder() : PhotoScan.scan({ after }));
  } finally {
    listener.remove();
  }
}

async function readFiles(files, onProgress) {
  const points = [];
  for (let i = 0; i < files.length; i++) {
    try {
      const e = await exifr.parse(files[i], { ifd0: false, exif: ['DateTimeOriginal', 'CreateDate'], gps: true });
      const taken = e?.DateTimeOriginal || e?.CreateDate;
      // exifr reads the camera's wall-clock time as local time, so the local date is the day it was taken there.
      if (e?.latitude != null && taken instanceof Date) points.push({ lat: e.latitude, lon: e.longitude, day: taken.toLocaleDateString('en-CA') });
    } catch { /* not a photo, or no readable data */ }
    if (i % 20 === 19) onProgress({ done: i + 1, total: files.length });
  }
  return { points, photos: files.length, videos: 0, located: points.length };
}

// source: picked files on web/desktop; on Android 'folder' (a picked folder) or null (photos added since the last scan).
export async function findPhotoTrips(places, countries, source, onProgress) {
  const files = Array.isArray(source) ? source : null;
  // v2: videos and SD cards were added, so the first scan with them reads everything again (duplicates are dropped).
  const last = (await db.settings.get('photoScan.v2'))?.value;
  const read = files ? await readFiles(files, onProgress) : await readLibrary(last?.lastAdded ?? 0, source === 'folder', onProgress);
  const found = await addSuggestions(places, countries, read.points, 'photo');
  if (!source) await db.settings.put({ key: 'photoScan.v2', value: { lastAdded: read.lastAdded, at: new Date().toISOString() } });
  return { photos: read.photos, videos: read.videos, located: read.located, found };
}

// Google Maps Timeline export(s): the places the person stayed, through the same trip rules as photos.
export async function importTimeline(places, countries, files) {
  const points = [];
  let visits = 0;
  for (const f of files) {
    const r = parseTimeline(await f.text());
    for (const p of r.points) points.push(p); // not push(...): years of history overflow the call stack
    visits += r.visits;
  }
  return { timelineVisits: visits, found: await addSuggestions(places, countries, points, 'timeline') };
}

// Android: events in the phone's calendar with a place, and flights. Same trip rules as photos.
export async function importCalendar(places, countries) {
  const { events } = await Calendar.events();
  const countryCodes = Object.fromEntries(countries.list.map(c => [norm(c.name), c.code]));
  const found = new Map(); // lookups repeat a lot (the same office, the same hotel): each text is resolved once
  const points = [];
  for (const e of events) {
    const q = eventQuery(e);
    if (!q) continue;
    const key = q.iata ? `iata:${q.iata}` : norm(q.text);
    if (!found.has(key)) {
      found.set(key, q.iata ? (await places.airportCities([q.iata]))[q.iata] ?? null : await placeFromText(q.text, places.search, countryCodes));
    }
    const p = found.get(key);
    if (p) for (const day of eventDays(e)) points.push({ lat: p.lat, lon: p.lon, day });
  }
  return { calendarEvents: events.length, found: await addSuggestions(places, countries, points, 'calendar') };
}

// A scanned boarding pass: one suggestion per flight, at the city its destination airport serves (not home).
export async function importBoardingPass(places, countries, text) {
  const legs = parseBoardingPass(text, today()).filter(l => l.date <= today()); // a pass for a flight not yet taken
  const cities = await places.airportCities(legs.map(l => l.to));
  const home = (await db.settings.get('home'))?.value;
  const trips = legs.filter(l => cities[l.to] && !(home && km(cities[l.to].lat, cities[l.to].lon, home.lat, home.lon) < HOME_KM))
    .map(l => ({ place: cities[l.to], dateFrom: l.date, dateTo: l.date, flight: { carrier: l.carrier, number: l.flight, from: l.from, to: l.to } }));
  return { legs, found: await saveTrips(countries, trips, 'boardingPass') };
}

// Points -> trips (home and airports skipped, consecutive days joined) -> new inbox suggestions. Returns how many.
async function addSuggestions(places, countries, points, source) {
  const home = (await db.settings.get('home'))?.value;
  const { trips } = await places.trips(points, home);
  return saveTrips(countries, trips, source);
}

async function saveTrips(countries, trips, source) {
  const fresh = unseenTrips(trips, await db.visits.toArray(), await db.suggestions.toArray());
  await db.suggestions.bulkAdd(fresh.map(t => ({
    ...makeVisit(t.place, countries.byCode[t.place.cc], { date: t.dateFrom, dateTo: t.dateTo === t.dateFrom ? undefined : t.dateTo, source }),
    status: 'pending',
    photos: t.photos, // points behind the trip: photos, or days of Timeline stays
    flight: t.flight, // boarding passes: carrier, number, from, to (never the passenger's name)
  })));
  return fresh.length;
}
