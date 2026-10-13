import { useState } from 'react';
import exifr from 'exifr';
import { writeBackup, documentsFs, BACKUP, PREV } from './backup.js';

// Tier 0 checks that only a real phone can answer. Nothing here is stored; results are shown and forgotten.
export default function Spikes() {
  const [photos, setPhotos] = useState('');
  const [backup, setBackup] = useState('');

  async function readPhotos(files) {
    setPhotos(`Reading ${files.length} photos…`);
    let withPlace = 0, withDate = 0, sample = '';
    for (const file of files) {
      const tags = await exifr.parse(file, { gps: true, pick: ['DateTimeOriginal', 'latitude', 'longitude'] }).catch(() => null);
      if (tags?.DateTimeOriginal) withDate++;
      if (tags?.latitude != null) {
        withPlace++;
        sample ||= `${tags.latitude.toFixed(1)}, ${tags.longitude.toFixed(1)}`;
      }
    }
    setPhotos(`${files.length} photos · ${withPlace} with location · ${withDate} with date${sample ? ` · e.g. ${sample}` : ''}`);
  }

  async function testBackup() {
    setBackup('Writing…');
    try {
      for (let i = 1; i <= 3; i++) await writeBackup(documentsFs, `Inkmap backup test ${i} at ${new Date().toISOString()}`);
      setBackup(`OK. Documents/${BACKUP} = "${await documentsFs.read(BACKUP)}"; .prev = "${await documentsFs.read(PREV)}"`);
    } catch (e) {
      setBackup(`Failed: ${e.message || e}`);
    }
  }

  return (
    <div className="spikes">
      <label className="button">
        Test photo locations
        <input type="file" accept="image/*" multiple hidden onChange={e => e.target.files.length && readPhotos([...e.target.files])} />
      </label>
      {photos && <p>{photos}</p>}
      <button className="button" onClick={testBackup}>Test backup to Documents</button>
      {backup && <p className="wrap">{backup}</p>}
    </div>
  );
}
