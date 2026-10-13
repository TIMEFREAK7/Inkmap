// The full backup (.inkbackup): versioned JSON with everything on the device.
export const FORMAT = 'inkmap-backup';
export const SCHEMA_VERSION = 1;
const TABLES = ['profile', 'visits', 'suggestions', 'family', 'settings'];

export class NewerBackupError extends Error {
  constructor() { super('This backup was made by a newer Inkmap. Please update the app, then try again.'); }
}

export async function buildBackup(db) {
  const data = { format: FORMAT, schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString() };
  for (const t of TABLES) data[t] = await db.table(t).toArray();
  return data;
}

// Validates a backup file's text. Throws a message a person can act on; never returns half a backup.
export function parseBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('This file is not an Inkmap backup.'); }
  if (data?.format !== FORMAT) throw new Error('This file is not an Inkmap backup.');
  if (!(data.schemaVersion <= SCHEMA_VERSION)) throw new NewerBackupError();
  for (const t of TABLES) if (!Array.isArray(data[t])) throw new Error('This backup is incomplete and cannot be restored.');
  return data;
}

// Replaces everything on the device with the backup, all or nothing.
export async function restoreBackup(db, data) {
  await db.transaction('rw', TABLES, async () => {
    for (const t of TABLES) {
      await db.table(t).clear();
      await db.table(t).bulkAdd(data[t]);
    }
  });
}

export const summarise = data => ({
  name: data.profile[0]?.name,
  friendId: data.profile[0]?.friendId,
  places: data.visits.length,
  exportedAt: data.exportedAt,
});
