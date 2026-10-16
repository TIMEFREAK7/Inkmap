import { Capacitor } from '@capacitor/core';
import { BackupFolder } from './native.js';
import { db } from './db.js';
import { buildBackup, parseBackup, NewerBackupError } from './backupFile.js';

export const BACKUP = 'inkmap-backup.inkbackup';
export const PREV = 'inkmap-backup.prev.inkbackup';
const TMP = 'inkmap-backup.tmp';

// An interrupted write must never destroy the only good copy:
// write the new data to a temp file, move the current backup to .prev, then move the temp file into place.
export async function writeBackup(fs, data) {
  await fs.write(TMP, data);
  if (await fs.exists(BACKUP)) {
    if (await fs.exists(PREV)) await fs.remove(PREV);
    await fs.rename(BACKUP, PREV);
  }
  await fs.rename(TMP, BACKUP);
}

// The folder the person picked (Android). It stays usable after a reinstall once picked again.
export const folderFs = {
  write: (name, data) => BackupFolder.write({ name, data }),
  read: name => BackupFolder.read({ name }).then(r => r.data),
  exists: name => BackupFolder.exists({ name }).then(r => r.exists),
  remove: name => BackupFolder.remove({ name }),
  rename: (from, to) => BackupFolder.rename({ from, to }),
};

// --- Automatic backup into the chosen folder (Android) ---

export const hasBackupFolder = Capacitor.isNativePlatform(); // shortcut: Windows/web backup arrives with their builds

const DEBOUNCE_MS = 5000;
let timer = null;
let listener = () => {};
export const onBackupResult = fn => { listener = fn; };

// A backup in the folder that belongs to someone else, or to another install of this person (a profile is
// created once per install; restoring a backup brings its profile, so a restored phone counts as the same install).
// Overwriting it would silently destroy that backup, e.g. after tapping Start instead of Restore on a new phone.
export class FolderConflict extends Error {
  constructor(found) {
    const p = found.profile[0];
    super(`That folder already has ${p?.name ? `${p.name}'s` : 'another'} backup (${found.visits.length} places). Inkmap won't overwrite it: restore it, or choose another folder.`);
    this.found = found;
  }
}

async function conflictWith(data) {
  let old;
  try { old = await readFolderBackup(); } catch (e) {
    if (e instanceof NewerBackupError) throw e; // made by a newer app: never overwrite with an older format
    return null; // damaged beyond reading: replacing it is the right thing
  }
  return otherOwner(old, data) ? old : null;
}

export function otherOwner(old, data) {
  const [a, b] = [old?.profile[0], data.profile[0]];
  return !!(a && b && (a.friendId !== b.friendId || a.createdAt !== b.createdAt));
}

// Returns { ok, at } or { ok: false, error, conflict? } (also sent to the listener for the Settings and home warnings).
export async function backupNow() {
  clearTimeout(timer);
  timer = null;
  let result;
  try {
    const data = await buildBackup(db);
    const other = await conflictWith(data);
    if (other) throw new FolderConflict(other);
    await writeBackup(folderFs, JSON.stringify(data));
    result = { ok: true, at: data.exportedAt };
  } catch (e) {
    result = { ok: false, error: e.message || String(e), conflict: e.found };
  }
  listener(result);
  return result;
}

// Call after every change. Writes 5 s after the last one, so a burst of edits is one write.
export function scheduleBackup() {
  if (!hasBackupFolder) return;
  clearTimeout(timer);
  timer = setTimeout(backupNow, DEBOUNCE_MS);
}

// Leaving the app inside the 5 s window must not lose the change.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.hidden && timer) backupNow(); });
}

// The newest readable backup in the chosen folder: the main file, else .prev if the main one is damaged.
export async function readFolderBackup() {
  let lastError = null;
  for (const name of [BACKUP, PREV]) {
    if (!(await folderFs.exists(name))) continue;
    try {
      return parseBackup(await folderFs.read(name));
    } catch (e) {
      if (e instanceof NewerBackupError) throw e;
      lastError = e;
    }
  }
  if (lastError) throw lastError;
  return null;
}
