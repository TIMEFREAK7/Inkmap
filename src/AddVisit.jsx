import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';

import { today, daysBetween, endAfter } from './dates.js';

// Search-first logging: type, pick, save. The date defaults to today.
export default function AddVisit({ places, countries, recent, onSave, onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [picked, setPicked] = useState(null);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(''); // optional last day; '' means a one-day visit
  const days = to ? daysBetween(from, to) : '';
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
    <motion.div className="sheet" role="dialog" aria-label="Add a place"
      initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
      transition={{ type: 'spring', stiffness: 400, damping: 40 }}
      // Focus only once the sheet is on screen; focusing mid-slide makes the browser scroll the whole app.
      onAnimationComplete={() => input.current?.focus({ preventScroll: true })}>
      {!picked ? (
        <>
          <div className="search-row">
            <input ref={input} className="search" type="search" enterKeyHint="search" placeholder="Search a city or town"
              aria-label="Search a city or town" value={query} onChange={e => setQuery(e.target.value)} />
            <button className="text-button" onClick={onClose}>Cancel</button>
          </div>
          {!places && <p className="hint">Getting places ready…</p>}
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
          <label className="field">
            When did you go?
            <input type="date" value={from} max={today()} onChange={e => {
              const f = e.target.value || today();
              if (to) setTo(endAfter(f, days)); // moving the start keeps the length of the stay
              setFrom(f);
            }} />
          </label>
          <div className="field-row">
            <label className="field">
              <span>Until <span className="optional">(optional)</span></span>
              <input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} />
            </label>
            <label className="field days">
              Days
              <input type="number" inputMode="numeric" min="1" max="3650" value={days} placeholder="1"
                onChange={e => { const n = parseInt(e.target.value, 10); setTo(n >= 1 ? endAfter(from, Math.min(n, 3650)) : ''); }} />
            </label>
          </div>
          <button className="primary" onClick={() => onSave(picked, from, to)}>Save this place</button>
        </div>
      )}
    </motion.div>
  );
}
