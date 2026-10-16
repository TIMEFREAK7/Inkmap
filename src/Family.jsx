import { useEffect, useMemo, useRef, useState } from 'react';
import { useBackHandler } from './sheet.jsx';
import { Map as MapLibreMap } from 'maplibre-gl';
import { cssVar } from './theme.js';
import { AnimatePresence, motion } from 'motion/react';
import { db } from './db.js';
import { shareFile } from './native.js';
import { scheduleBackup } from './backup.js';
import { buildShare, parseShare, decideImport, applyImport } from './share.js';

const countedCodes = visits => [...new Set(visits.filter(v => v.exitedAirport).map(v => v.countryCode))];
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const updated = iso => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export default function Family({ profile, visits, family, countries, onChanged }) {
  const [hidden, setHidden] = useState(new Set()); // friend IDs filtered off the map
  const [pending, setPending] = useState(null); // a new person's share, waiting for Add / Cancel
  const [removing, setRemoving] = useState(null);
  const [message, setMessage] = useState('');
  const fileRef = useRef(null);

  const people = useMemo(() => [
    { id: profile.friendId, name: `${profile.name} (you)`, colour: profile.colour, codes: countedCodes(visits) },
    ...family.map(f => ({ id: f.friendId, name: f.name, colour: f.colour, codes: countedCodes(f.visits) })),
  ], [profile, visits, family]);

  async function share() {
    const data = JSON.stringify(buildShare(profile, visits));
    const name = `inkmap-${profile.name.replace(/[^\p{L}\p{N}]+/gu, '-')}.inkshare`;
    try {
      await shareFile(new File([data], name, { type: 'application/octet-stream' }), 'Share my Inkmap');
    } catch (e) {
      if (e.name !== 'AbortError') setMessage(`Could not share: ${e.message}`);
    }
  }

  async function importFile(file) {
    setMessage('');
    if (file.size > 20 * 1024 * 1024) return setMessage('This file is too big to be an Inkmap family file.'); // real ones are well under 1 MB
    try {
      const shareData = parseShare(await file.text(), new Set(countries.list.map(c => c.code)));
      const decision = decideImport(shareData, profile.friendId, await db.family.get(shareData.friendId));
      if (decision === 'own') setMessage("That's your own file. Send it to your family instead.");
      else if (decision === 'older') setMessage(`You already have a newer copy of ${shareData.name}'s map.`);
      else if (decision === 'ask-add') setPending(shareData);
      else setPending({ ...shareData, update: true }); // anyone can type a friend ID: confirm before replacing a map
    } catch (e) {
      setMessage(e.message);
    }
  }

  async function save(shareData, text) {
    await applyImport(db, shareData);
    scheduleBackup();
    setPending(null);
    setMessage(text);
    onChanged();
  }

  async function remove() {
    await db.family.delete(removing.friendId);
    scheduleBackup();
    setRemoving(null);
    onChanged();
  }

  return (
    <div className="screen family">
      <h1 className="title small">Family</h1>
      <FamilyMap geo={countries.geo} people={people.filter(p => !hidden.has(p.id))} />
      <div className="chips" role="group" aria-label="Show on the map">
        {people.map(p => (
          <button key={p.id} className={hidden.has(p.id) ? 'chip off' : 'chip'} aria-pressed={!hidden.has(p.id)}
            onClick={() => setHidden(h => { const n = new Set(h); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })}>
            <span className="dot" style={{ background: p.colour }} />{p.name}
          </button>
        ))}
      </div>

      {message && <p className="notice" role="status">{message}</p>}
      <div className="family-actions">
        <button className="primary" onClick={share}>Share my map</button>
        <button className="secondary" onClick={() => fileRef.current.click()}>Add from a family file</button>
        <input ref={fileRef} type="file" hidden onChange={e => { const f = e.target.files[0]; e.target.value = ''; if (f) importFile(f); }} />
      </div>

      {family.length === 0 ? (
        <p className="hint">No family yet. Ask them to tap “Share my map” and send you the file, then add it here.</p>
      ) : (
        <ul className="people">
          <AnimatePresence initial={false}>
            {family.map(f => (
              <motion.li key={f.friendId} className="person" layout
                initial={{ x: -40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }}>
                <span className="avatar small" style={{ background: f.colour }}>{f.name[0]?.toUpperCase()}</span>
                <span className="person-text">
                  <span className="result-name">{f.name}</span>
                  <span className="result-where">{plural(countedCodes(f.visits).length, 'country', 'countries')} · Updated {updated(f.lastExportedAt)}</span>
                </span>
                <button className="text-button" onClick={() => setRemoving(f)} aria-label={`Remove ${f.name}`}>Remove</button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      {pending && (
        <Dialog title={pending.update ? `Update ${pending.name}'s map (${pending.friendId})?` : `Add ${pending.name} (${pending.friendId}) to your family?`}
          text={`${plural(countedCodes(pending.visits).length, 'country', 'countries')} · Updated ${updated(pending.exportedAt)}`}
          confirm={pending.update ? 'Update' : 'Add'}
          onConfirm={() => save(pending, pending.update ? `Updated ${pending.name}'s map.` : `Added ${pending.name}.`)} onCancel={() => setPending(null)} />
      )}
      {removing && (
        <Dialog title={`Remove ${removing.name}?`}
          text="Their map is deleted from this phone. You can add them again from a new file."
          confirm="Remove" danger onConfirm={remove} onCancel={() => setRemoving(null)} />
      )}
    </div>
  );
}

function Dialog({ title, text, confirm, danger, onConfirm, onCancel }) {
  useBackHandler(onCancel); // the back gesture cancels the question, not the whole screen
  return (
    <div className="scrim" onClick={onCancel}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
        <h2 className="dialog-title">{title}</h2>
        <p className="hint">{text}</p>
        <button className={danger ? 'danger' : 'primary'} onClick={onConfirm} autoFocus>{confirm}</button>
        <button className="secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// Everyone's countries on one flat world map, each person in their colour; people fade in one after another.
function FamilyMap({ geo, people }) {
  const el = useRef(null);
  useEffect(() => {
    const map = new MapLibreMap({
      container: el.current, attributionControl: false, bounds: [[-170, -58], [180, 78]],
      pixelRatio: Math.min(devicePixelRatio, 2), canvasContextAttributes: { antialias: true }, renderWorldCopies: false,
      style: {
        version: 8,
        sources: { countries: { type: 'geojson', data: geo } },
        layers: [
          { id: 'sea', type: 'background', paint: { 'background-color': cssVar('--surface-container') } }, // the map reads as a card
          { id: 'land', type: 'fill', source: 'countries', paint: { 'fill-color': cssVar('--map-land') } },
          ...people.map((p, i) => ({
            id: `p${i}`, type: 'fill', source: 'countries', filter: ['in', ['get', 'iso'], ['literal', p.codes]],
            paint: { 'fill-color': p.colour, 'fill-opacity': 0, 'fill-opacity-transition': { duration: 600, delay: i * 400 } },
          })),
          { id: 'border', type: 'line', source: 'countries', paint: { 'line-color': cssVar('--map-border'), 'line-width': 0.5 } },
        ],
      },
    });
    // Overlapping countries blend, so a place two people share reads as both colours.
    map.once('load', () => people.forEach((p, i) => map.setPaintProperty(`p${i}`, 'fill-opacity', 0.6)));
    return () => map.remove();
  }, [geo, people]);
  return <div ref={el} className="family-map" />;
}
