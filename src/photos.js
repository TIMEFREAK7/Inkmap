// Photo backfill: read place and date from photos, turn them into suggestions for the inbox.
// Only coordinates and days are read; photos are never copied or kept.
import { Capacitor } from '@capacitor/core';
import exifr from 'exifr';
import { db } from './db.js';
import { PhotoScan } from './native.js';
import { makeVisit } from './visits.js';
import { unseenTrips } from './backfill.js';

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
  const home = (await db.settings.get('home'))?.value;
  const read = files ? await readFiles(files, onProgress) : await readLibrary(last?.lastAdded ?? 0, source === 'folder', onProgress);
  const { trips } = await places.trips(read.points, home);
  const fresh = unseenTrips(trips, await db.visits.toArray(), await db.suggestions.toArray());
  await db.suggestions.bulkAdd(fresh.map(t => ({
    ...makeVisit(t.place, countries.byCode[t.place.cc], { date: t.dateFrom, dateTo: t.dateTo === t.dateFrom ? undefined : t.dateTo, source: 'photo' }),
    status: 'pending',
    photos: t.photos,
  })));
  if (!source) await db.settings.put({ key: 'photoScan.v2', value: { lastAdded: read.lastAdded, at: new Date().toISOString() } });
  return { photos: read.photos, videos: read.videos, located: read.located, found: fresh.length };
}
