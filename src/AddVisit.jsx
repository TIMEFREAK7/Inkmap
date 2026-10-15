import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { useSheetDrag } from './sheet.jsx';

import { today } from './dates.js';
import DateFields from './DateFields.jsx';

// Search-first logging: type, pick, save. The date defaults to today.
export default function AddVisit({ places, countries, recent, onSave, onClose, onFind }) {
  const drag = useSheetDrag(onClose);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [picked, setPicked] = useState(null);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(''); // optional last day; '' means a one-day visit
  const latest = useRef(0);
  const input = useRef(null);

  useEffect(() => {
    if (!places || !query.trim()) { setResults([]); return; }
    const ask = ++latest.current;
    places.search(query).then(r => { if (ask === latest.current) setResults(r); }); // drop answers to older keystrokes
  }, [query, places]);

  const label = p => [countries.admin1[`${p.cc}.${p.admin1}`], countries.byCode[p.cc]?.name].filter(Boolean).join(', ');
  const list = query.trim() ? results : recent;

  return (
    <motion.div className="sheet" {...drag.sheet} role="dialog" aria-modal="true" aria-label="Add a place"
      initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
      transition={{ type: 'spring', stiffness: 400, damping: 40 }}
      // Focus only once the sheet is on screen; focusing mid-slide makes the browser scroll the whole app.
      onAnimationComplete={() => input.current?.focus({ preventScroll: true })}>
      {drag.handle}
      {!picked ? (
        <>
          <div className="search-row">
            <input ref={input} className="search" type="search" enterKeyHint="search" placeholder="Search a city or town" aria-label="Search a city or town"
              aria-label="Search a city or town" value={query} onChange={e => setQuery(e.target.value)} />
            <button className="text-button" onClick={onClose}>Cancel</button>
          </div>
          {!places && <p className="hint">Getting places ready…</p>}
          {!query.trim() && (
            <button className="find-row" onClick={onFind}>
              <span className="result-name">Find places you've been</span>
              <span className="result-where">From your photos, boarding passes, calendar or Google Maps Timeline</span>
            </button>
          )}
          {!query.trim() && recent.length > 0 && <h2 className="list-title">Recent places</h2>}
          {query.trim() && places && results.length === 0 && <p className="hint">No place called “{query.trim()}”. Try another spelling.</p>}
          <ul className="results">
            {list.map((p, i) => (
              <motion.li key={p.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                <button className="result" onClick={() => setPicked(p)}>
                  <span className="result-name">{p.name}</span>
                  <span className="result-where">{label(p)}</span>
                </button>
              </motion.li>
            ))}
          </ul>
        </>
      ) : (
        <div className="confirm">
          <button className="text-button back" onClick={() => setPicked(null)}>‹ Back</button>
          <h2 className="confirm-name">{picked.name}</h2>
          <p className="result-where">{label(picked)}</p>
          <DateFields from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
          <button className="primary" onClick={() => onSave(picked, from, to)}>Save this place</button>
        </div>
      )}
    </motion.div>
  );
}
