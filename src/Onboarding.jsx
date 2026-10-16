import { useState } from 'react';
import { db } from './db.js';
import { newFriendId, parseFriendId } from './friendId.js';
import { BackupFolder } from './native.js';
import { hasBackupFolder, backupNow, readFolderBackup } from './backup.js';
import { restoreBackup, summarise } from './backupFile.js';

export const COLOURS = ['#f6ad3b', '#ff7a6b', '#f472b6', '#a78bfa', '#60a5fa', '#2dd4bf', '#4ade80', '#e2e8f0'];
// Spoken names, so a screen reader doesn't read out hex codes.
export const COLOUR_NAMES = { '#f6ad3b': 'Orange', '#ff7a6b': 'Coral', '#f472b6': 'Pink', '#a78bfa': 'Purple', '#60a5fa': 'Blue', '#2dd4bf': 'Teal', '#4ade80': 'Green', '#e2e8f0': 'White' };

// First launch: start fresh, come back with an old friend ID, or restore a backup. Ends with a backup folder.
export default function Onboarding({ onDone }) {
  const [step, setStep] = useState('welcome');
  const [name, setName] = useState('');
  const [colour, setColour] = useState(COLOURS[0]);
  const [idText, setIdText] = useState('');
  const [found, setFound] = useState(null);
  const [message, setMessage] = useState('');
  const [clash, setClash] = useState(false); // the backup folder picked for a new start already holds a backup

  const typedId = parseFriendId(idText);
  const ready = name.trim() && (step === 'fresh' || typedId);

  async function createProfile() {
    await db.profile.add({ friendId: step === 'fresh' ? newFriendId() : typedId, name: name.trim(), colour, createdAt: new Date().toISOString() });
    if (hasBackupFolder) setStep('folder');
    else onDone();
  }

  async function chooseFolder() {
    try {
      await BackupFolder.pick();
      const r = await backupNow();
      if (r.conflict) { setFound(r.conflict); setClash(true); setStep('restore'); return; } // a backup is already there: offer it
      if (!r.ok) { setMessage(r.error); return; }
      onDone();
    } catch (e) {
      setMessage(e.message === 'No folder chosen' ? '' : e.message);
    }
  }

  async function findBackup() {
    setMessage('');
    try {
      await BackupFolder.pick();
      const data = await readFolderBackup();
      if (data) setFound(data);
      else setMessage('There is no Inkmap backup in that folder. Pick the folder where your backup is saved.');
    } catch (e) {
      if (e.message !== 'No folder chosen') setMessage(e.message);
    }
  }

  async function restore() {
    await restoreBackup(db, found);
    onDone();
  }

  if (step === 'welcome') {
    return (
      <Screen>
        <img className="logo" src="./icon-192.png" alt="" width="96" height="96" />
        <h1 className="title">Inkmap</h1>
        <p className="lead">Your map of every place you've been. Everything stays on this phone.</p>
        <div className="actions">
          <button className="primary" onClick={() => setStep('fresh')}>Start</button>
          {hasBackupFolder && <button className="secondary" onClick={() => setStep('restore')}>Restore from a backup</button>}
          <button className="text-button" onClick={() => setStep('haveId')}>I already have an ID</button>
        </div>
      </Screen>
    );
  }

  if (step === 'restore') {
    const s = found && summarise(found);
    return (
      <Screen onBack={() => { setFound(null); setStep('welcome'); }}>
        <h1 className="title">Restore from a backup</h1>
        {!found ? (
          <>
            <p className="lead">Pick the folder where Inkmap saved your backup. It was usually Documents › Inkmap.</p>
            {message && <p className="warn" role="alert">{message}</p>}
            <div className="actions"><button className="primary" onClick={findBackup}>Pick backup folder</button></div>
          </>
        ) : (
          <>
            <p className="lead">{clash ? 'That folder already has a backup. Inkmap will not overwrite it.' : ''} Found {s.name ? `${s.name}'s` : 'a'} backup:</p>
            <ul className="facts">
              <li>{s.places} {s.places === 1 ? 'place' : 'places'}</li>
              <li>Saved {new Date(s.exportedAt).toLocaleString()}</li>
              {s.friendId && <li>Friend ID {s.friendId}</li>}
            </ul>
            <p className="lead">Restoring replaces everything in Inkmap on this phone with this backup.</p>
            <div className="actions">
              <button className="primary" onClick={restore}>Restore this backup</button>
              {clash
                ? <button className="secondary" onClick={() => { setFound(null); setClash(false); setStep('folder'); }}>Start fresh, choose another folder</button>
                : <button className="secondary" onClick={() => setFound(null)}>Pick a different folder</button>}
            </div>
          </>
        )}
      </Screen>
    );
  }

  if (step === 'folder') {
    return (
      <Screen>
        <h1 className="title">Where should Inkmap keep your backup?</h1>
        <p className="lead">Pick a folder. Inkmap saves a copy there after every change, so you get everything back if the app is ever removed. Documents › Inkmap is a good place.</p>
        {message && <p className="warn" role="alert">{message}</p>}
        <div className="actions">
          <button className="primary" onClick={chooseFolder}>Choose folder</button>
          <button className="text-button" onClick={onDone}>Not now</button>
        </div>
      </Screen>
    );
  }

  // 'fresh' or 'haveId'
  return (
    <Screen onBack={() => setStep('welcome')}>
      <h1 className="title">{step === 'fresh' ? 'About you' : 'Welcome back'}</h1>
      <label className="field">
        Your name
        <input value={name} onChange={e => setName(e.target.value)} autoComplete="given-name" maxLength={40} />
      </label>
      {step === 'haveId' && (
        <label className="field">
          Your friend ID
          <input value={idText} onChange={e => setIdText(e.target.value)} placeholder="IM-XXXX-XXXX" autoCapitalize="characters" spellCheck={false}
            autoComplete="off" enterKeyHint="done" aria-invalid={!!idText && !typedId} aria-describedby="id-help" />
          {idText && !typedId && <span className="warn" id="id-help" role="alert">That doesn't look like an ID yet. It has the form IM-XXXX-XXXX.</span>}
          {typedId && <span className="hint-inline">Will use {typedId}</span>}
        </label>
      )}
      <fieldset className="field colours" role="radiogroup">
        <legend>Your colour on the map</legend>
        {COLOURS.map(c => (
          <button key={c} className={c === colour ? 'swatch picked' : 'swatch'} style={{ background: c }}
            role="radio" aria-label={COLOUR_NAMES[c]} aria-checked={c === colour} onClick={() => setColour(c)} />
        ))}
      </fieldset>
      <div className="actions">
        <button className="primary" disabled={!ready} onClick={createProfile}>Continue</button>
      </div>
    </Screen>
  );
}

function Screen({ children, onBack }) {
  return (
    <div className="onboarding">
      {onBack && <button className="text-button back" onClick={onBack}><span aria-hidden="true">‹ </span>Back</button>}
      {children}
    </div>
  );
}
