import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

export const BACKUP = 'Inkmap/inkmap-backup.inkbackup';
export const PREV = 'Inkmap/inkmap-backup.prev.inkbackup';
const TMP = 'Inkmap/inkmap-backup.tmp';

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

// Public Documents folder on Android, so the backup survives uninstalling the app.
const at = path => ({ path, directory: Directory.Documents });
export const documentsFs = {
  write: (path, data) => Filesystem.writeFile({ ...at(path), data, encoding: Encoding.UTF8, recursive: true }),
  read: path => Filesystem.readFile({ ...at(path), encoding: Encoding.UTF8 }).then(r => r.data),
  exists: path => Filesystem.stat(at(path)).then(() => true, () => false),
  remove: path => Filesystem.deleteFile(at(path)),
  rename: (from, to) => Filesystem.rename({ from, to, directory: Directory.Documents, toDirectory: Directory.Documents }),
};
