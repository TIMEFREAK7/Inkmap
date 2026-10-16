// A few photos per visit, picked by the person. Each is shrunk so a place costs ~150-250 KB, not the 3-8 MB original.
import { db } from './db.js';
import { scheduleBackup, removePhotoFile } from './backup.js';

export const MAX_PHOTOS = 5;
const LONG_SIDE = 1280; // sharp on a phone screen, small on disk

async function shrink(file) {
  const img = await createImageBitmap(file); // turns phone photos upright (EXIF orientation) by default
  const scale = Math.min(1, LONG_SIDE / Math.max(img.width, img.height));
  const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(img.width * scale), height: Math.round(img.height * scale) });
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  img.close();
  return canvas.toDataURL('image/jpeg', 0.8);
}

export const photosOf = visitId => db.photos.where('visitId').equals(visitId).sortBy('addedAt');

// Adds up to the remaining room; returns how many were left out because the visit is full.
export async function addPhotos(visitId, files) {
  const room = MAX_PHOTOS - (await db.photos.where('visitId').equals(visitId).count());
  const take = [...files].filter(f => f.type.startsWith('image/')).slice(0, Math.max(0, room));
  for (const f of take) {
    await db.photos.add({ id: crypto.randomUUID(), visitId, data: await shrink(f), addedAt: Date.now(), pending: 1 });
  }
  if (take.length) scheduleBackup();
  return files.length - take.length;
}

export async function removePhoto(id) {
  await db.photos.delete(id);
  await removePhotoFile(id);
  scheduleBackup();
}

// Photos of deleted visits are kept while Undo is still possible, and cleared here at the next launch.
export async function prunePhotos() {
  const visits = new Set(await db.visits.toCollection().primaryKeys());
  const byVisit = db.photos.orderBy('visitId');
  const [visitIds, ids] = [await byVisit.keys(), await byVisit.primaryKeys()];
  const orphans = ids.filter((_, i) => !visits.has(visitIds[i]));
  for (const id of orphans) await removePhoto(id);
  return orphans.length;
}
