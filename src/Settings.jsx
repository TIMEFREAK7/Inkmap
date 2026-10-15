import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { useSheetDrag } from './sheet.jsx';
import { BackupFolder } from './native.js';
import { hasBackupFolder, backupNow, scheduleBackup } from './backup.js';
import { COLOURS } from './Onboarding.jsx';
import { loadBoundarySources } from './data.js';
import { db } from './db.js';

export default function Settings({ profile, backup, onSaveProfile, onClose, onPhotos, showFps, onShowFps }) {
  const drag = useSheetDrag(onClose);
  const [name, setName] = useState(profile.name);
  const [folder, setFolder] = useState(null);
  const [copied, setCopied] = useState(false);
  const [sources, setSources] = useState(null);
  const [home, setHome] = useState(null);

  useEffect(() => { db.settings.get('home').then(r => setHome(r?.value ?? null)); }, []);
  useEffect(() => { if (hasBackupFolder) BackupFolder.current().then(f => setFolder(f.name ? f : null), () => {}); }, []);

  async function copyId() {
    await navigator.clipboard?.writeText(profile.friendId);
    setCopied(true);
  }

  async function changeFolder() {
    try {
      setFolder(await BackupFolder.pick());
      await backupNow();
    } catch { /* picker closed without a folder: keep the old one */ }
  }

  return (
    <motion.div className="sheet" {...drag.sheet} role="dialog" aria-modal="true" aria-label="Settings"
      initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 400, damping: 40 }}>
      {drag.handle}
      <div className="sheet-head">
        <h1 className="title small">Settings</h1>
        <button className="text-button" onClick={onClose}>Done</button>
      </div>
      <div className="scroll">
        <section className="card">
          <div className="me">
            <span className="avatar big" style={{ background: profile.colour }}>{profile.name[0]?.toUpperCase()}</span>
            <span className="me-name">{profile.name}</span>
          </div>
          <label className="field compact">
            Name
            <input value={name} maxLength={40} onChange={e => setName(e.target.value)}
              onBlur={() => name.trim() && name.trim() !== profile.name && onSaveProfile({ name: name.trim() })} />
          </label>
          <fieldset className="field colours compact">
            <legend>Your colour on the map</legend>
            {COLOURS.map(c => (
              <button key={c} className={c === profile.colour ? 'swatch picked' : 'swatch'} style={{ background: c }}
                aria-label={`Colour ${c}`} aria-pressed={c === profile.colour} onClick={() => onSaveProfile({ colour: c })} />
            ))}
          </fieldset>
          <p className="label">Your friend ID</p>
          <p className="friend-id">{profile.friendId}</p>
          <button className="secondary" onClick={copyId}>{copied ? 'Copied' : 'Copy ID'}</button>
          <p className="hint">Keep this ID. If you reinstall Inkmap without a backup, choose “I already have an ID” and type it in, so your family's copy of your map stays linked to you.</p>
        </section>

        {hasBackupFolder && (
          <section className="card">
            <p className="label">Backup</p>
            <p>{folder ? <>Saved after every change to <b>{folder.name}</b></> : 'No backup folder chosen. Your places are only inside the app.'}</p>
            {backup?.ok && <p className="hint">Last backup {new Date(backup.at).toLocaleString()}</p>}
            {backup && !backup.ok && <p className="warn" role="alert">The last backup failed: {backup.error}</p>}
            <button className="secondary" onClick={changeFolder}>{folder ? 'Change folder' : 'Choose folder'}</button>
            {folder && <button className="secondary" onClick={backupNow}>Back up now</button>}
            <p className="hint">If this phone is lost or reset, the backup folder goes with it. Now and then, copy the file inkmap-backup.inkbackup from that folder to Google Drive or another device.</p>
          </section>
        )}

        <section className="card">
          <p className="label">Find places you've been</p>
          <p className="hint">From where and when your photos were taken, or from your Google Maps Timeline. You check each one before it's added.</p>
          {home && (
            <p>Home town: <b>{home.name}</b>. Photos taken around it are skipped.{' '}
              <button className="text-button" onClick={async () => { await db.settings.delete('home'); scheduleBackup(); setHome(null); }}>Clear</button>
            </p>
          )}
          <button className="secondary" onClick={onPhotos}>Find places I've been</button>
        </section>

        <section className="card">
          <p className="label">About</p>
          <p className="hint">Place names from GeoNames (geonames.org), licensed CC BY 4.0. Country outlines on the globe from Natural Earth. State and district borders from geoBoundaries (geoboundaries.org), each under its source's open licence. Airports from OurAirports. Continents follow the UN M49 regions.</p>
          {/* Most boundary licences require naming the source, so every country's is listed. */}
          <details onToggle={e => e.target.open && !sources && loadBoundarySources().then(setSources)}>
            <summary className="text-button">Border sources by country</summary>
            {sources && (
              <ul className="sources">
                {Object.entries(sources).map(([cc, levels]) => (
                  <li key={cc}><b>{cc}</b> {levels.map(l => `${l.unit || l.level}: ${l.source} (${l.license})`).join('; ')}</li>
                ))}
              </ul>
            )}
          </details>
          <p className="hint">Built with React, MapLibre GL JS, Dexie, Motion and Capacitor, all free and open-source. Fonts: Inter and Space Grotesk (SIL Open Font License). Flags: flag-icons (MIT). Photo data read with exifr (MIT). Boarding pass barcodes read with zxing-wasm (MIT), built from zxing-cpp (Apache-2.0). PDFs opened with pdf.js (Apache-2.0).</p>
          <label className="check">
            <input type="checkbox" checked={showFps} onChange={e => onShowFps(e.target.checked)} />
            Show frame rate (for testing a phone)
          </label>
        </section>
      </div>
    </motion.div>
  );
}
