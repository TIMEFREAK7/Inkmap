import { today, daysBetween, endAfter } from './dates.js';

// From date, optional Until date and a Days count, kept in sync. to === '' means a one-day visit.
export default function DateFields({ from, to, onChange }) {
  const days = to ? daysBetween(from, to) : '';
  return (
    <>
      <label className="field">
        When did you go?
        <input type="date" value={from} max={today()} onChange={e => {
          const f = e.target.value || today();
          onChange(f, to ? endAfter(f, days) : ''); // moving the start keeps the length of the stay
        }} />
      </label>
      <div className="field-row">
        <label className="field">
          <span>Until <span className="optional">(optional)</span></span>
          <input type="date" value={to} min={from} onChange={e => onChange(from, e.target.value)} />
        </label>
        <label className="field days">
          Days
          <input type="number" inputMode="numeric" min="1" max="3650" value={days} placeholder="1"
            onChange={e => { const n = parseInt(e.target.value, 10); onChange(from, n >= 1 ? endAfter(from, Math.min(n, 3650)) : ''); }} />
        </label>
      </div>
    </>
  );
}
