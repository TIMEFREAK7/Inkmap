import { useState } from 'react';
import { motion } from 'motion/react';
import { useSheetDrag } from './sheet.jsx';
import DateFields from './DateFields.jsx';

export default function EditVisit({ visit, where, onSave, onDelete, onClose }) {
  const drag = useSheetDrag(onClose);
  const [from, setFrom] = useState(visit.dateFrom);
  const [to, setTo] = useState(visit.dateTo || '');
  const [note, setNote] = useState(visit.note || '');

  return (
    <motion.div className="sheet" {...drag.sheet} role="dialog" aria-label={`Edit ${visit.name}`}
      initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 400, damping: 40 }}>
      {drag.handle}
      <div className="confirm">
        <button className="text-button back" onClick={onClose}>‹ Back</button>
        <h2 className="confirm-name">{visit.name}</h2>
        <p className="result-where">{where}</p>
        <DateFields from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
        <label className="field">
          Note <span className="optional">(optional)</span>
          <textarea rows="3" value={note} maxLength={500} onChange={e => setNote(e.target.value)} />
        </label>
        <button className="primary" onClick={() => onSave({ dateFrom: from, dateTo: to || undefined, note: note.trim() })}>Save changes</button>
        {/* Undo replaces a confirmation dialog (spec UX rule 3). */}
        <button className="danger" onClick={onDelete}>Delete this visit</button>
      </div>
    </motion.div>
  );
}
