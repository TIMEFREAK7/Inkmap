import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { BackupFolder } from './native.js';
import { hasBackupFolder, backupNow } from './backup.js';

export default function Settings({ profile, backup, onClose }) {
  const [folder, setFolder] = useState(null);
  const [copied, setCopied] = useState(false);

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
    <motion.div className="sheet" role="dialog" aria-label="Settings"
      initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 400, damping: 40 }}>
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
          <p className="label">About</p>
          <p className="hint">Place names from GeoNames (geonames.org), licensed CC BY 4.0. Country and state borders from Natural Earth. Airports from OurAirports. Continents follow the UN M49 regions.</p>
          <p className="hint">Built with React, MapLibre GL JS, Dexie, Motion and Capacitor, all free and open-source.</p>
        </section>
      </div>
    </motion.div>
  );
}
