import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { useSheetDrag, useBackHandler } from './sheet.jsx';
import DateFields from './DateFields.jsx';
import { MAX_PHOTOS, photosOf, addPhotos, removePhoto } from './visitPhotos.js';

export default function EditVisit({ visit, where, onSave, onDelete, onClose }) {
  const drag = useSheetDrag(onClose);
  const [from, setFrom] = useState(visit.dateFrom);
  const [to, setTo] = useState(visit.dateTo || '');
  const [note, setNote] = useState(visit.note || '');

  return (
    <motion.div className="sheet" {...drag.sheet} role="dialog" aria-modal="true" aria-label={`Edit ${visit.name}`}
      initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 400, damping: 40 }}>
      {drag.handle}
      <div className="confirm">
        <button className="text-button back" onClick={onClose}><span aria-hidden="true">‹ </span>Back</button>
        <h2 className="confirm-name">{visit.name}</h2>
        <p className="result-where">{where}</p>
        <DateFields from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
        <label className="field">
          Note <span className="optional">(optional)</span>
          <textarea rows="3" value={note} maxLength={500} onChange={e => setNote(e.target.value)} />
        </label>
        <Photos visitId={visit.id} />
        <button className="primary" onClick={() => onSave({ dateFrom: from, dateTo: to || undefined, note: note.trim() })}>Save changes</button>
        {/* Undo replaces a confirmation dialog (spec UX rule 3). */}
        <button className="danger" onClick={onDelete}>Delete this visit</button>
      </div>
    </motion.div>
  );
}

// Saved as soon as they're picked or deleted (not with "Save changes"), like a gallery.
function Photos({ visitId }) {
  const [photos, setPhotos] = useState([]);
  const [viewing, setViewing] = useState(null);
  const [status, setStatus] = useState('');
  const input = useRef(null);
  const load = () => photosOf(visitId).then(setPhotos);
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function add(e) {
    const files = [...e.target.files];
    e.target.value = ''; // picking the same photo again must still fire
    if (!files.length) return;
    setStatus('Adding…');
    try {
      const left = await addPhotos(visitId, files);
      setStatus(left ? `Only ${MAX_PHOTOS} photos per place, so ${left} ${left === 1 ? 'was' : 'were'} left out.` : '');
    } catch (err) {
      setStatus(`Could not add that photo: ${err.message}`);
    }
    load();
  }

  return (
    <div className="field">
      <span>Photos <span className="optional">(up to {MAX_PHOTOS})</span></span>
      <div className="photo-grid">
        {photos.map((p, i) => (
          <button key={p.id} className="photo" onClick={() => setViewing(p)} aria-label={`Photo ${i + 1}, open`}><img src={p.data} alt="" /></button>
        ))}
        {photos.length < MAX_PHOTOS && <button className="photo add" onClick={() => input.current.click()} aria-label="Add photos">+</button>}
      </div>
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={add} />
      {status && <p className="hint-inline" role="status">{status}</p>}
      {viewing && <PhotoView photo={viewing} onClose={() => setViewing(null)}
        onDelete={async () => { await removePhoto(viewing.id); setViewing(null); load(); }} />}
    </div>
  );
}

function PhotoView({ photo, onClose, onDelete }) {
  useBackHandler(onClose);
  return (
    <div className="photo-view" role="dialog" aria-modal="true" aria-label="Photo">
      <img src={photo.data} alt="" />
      <div className="photo-view-buttons">
        <button className="secondary" onClick={onClose} autoFocus>Close</button>
        <button className="danger" onClick={onDelete}>Delete photo</button>
      </div>
    </div>
  );
}
