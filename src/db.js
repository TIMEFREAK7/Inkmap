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
