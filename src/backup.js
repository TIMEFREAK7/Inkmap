import { BackupFolder } from './native.js';

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
