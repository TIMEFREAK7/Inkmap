import { useEffect, useState } from 'react';
import { PhotoScan, BackupFolder } from './native.js';
import { writeBackup, folderFs, BACKUP, PREV } from './backup.js';

// Tier 0 checks that only a real phone can answer. Nothing here is stored; results are shown and forgotten.
export default function Spikes() {
  const [photos, setPhotos] = useState('');
  const [folder, setFolder] = useState(null);
  const [backup, setBackup] = useState('');

  useEffect(() => { BackupFolder.current().then(f => setFolder(f.name ? f : null), () => {}); }, []);

  async function scanPhotos() {
    setPhotos('Reading your latest 50 photos…');
    try {
      const r = await PhotoScan.scanRecent({ limit: 50 });
      setPhotos(`${r.scanned} photos · ${r.withLocation} with location · ${r.withDate} with date`
        + `${r.sample ? ` · e.g. ${r.sample}` : ''} · location permission: ${r.locationPermission}`);
    } catch (e) {
      setPhotos(`Failed: ${e.message || e}`);
    }
  }

  async function pickFolder() {
    try { setFolder(await BackupFolder.pick()); } catch (e) { setBackup(`Failed: ${e.message || e}`); }
  }

  async function testBackup() {
    setBackup('Writing…');
    try {
      for (let i = 1; i <= 3; i++) await writeBackup(folderFs, `Inkmap backup test ${i} at ${new Date().toISOString()}`);
      setBackup(`OK. ${BACKUP} = "${await folderFs.read(BACKUP)}"; .prev = "${await folderFs.read(PREV)}"`);
    } catch (e) {
      setBackup(`Failed: ${e.message || e}`);
    }
  }

  return (
    <div className="spikes">
      <button className="button" onClick={scanPhotos}>Scan latest 50 photos</button>
      {photos && <p className="wrap">{photos}</p>}
      <button className="button" onClick={pickFolder}>{folder ? `Backup folder: ${folder.name}` : 'Choose backup folder'}</button>
      {folder && <button className="button" onClick={testBackup}>Test backup to this folder</button>}
      {backup && <p className="wrap">{backup}</p>}
    </div>
  );
}
