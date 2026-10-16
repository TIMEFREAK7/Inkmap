import Dexie from 'dexie';

// All user data lives here, on this device only (see the spec's data model).
export const db = new Dexie('inkmap');
db.version(1).stores({
  profile: 'friendId',
  visits: 'id, geonameId, countryCode, dateFrom, createdAt',
  suggestions: 'id, status',
  family: 'friendId',
  settings: 'key',
});
// Up to 5 photos per visit, shrunk on the phone. Kept out of the backup JSON (it's rewritten after every change);
// each photo is its own file in the backup folder. pending: 1 until that file is written (indexed, then removed).
db.version(2).stores({ photos: 'id, visitId, pending' });
