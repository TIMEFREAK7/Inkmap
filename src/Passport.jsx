import { useState } from 'react';
import { motion } from 'motion/react';
import { flagUrl } from './flags.js';
import { passportStamps, CONTINENT_HUES } from './visits.js';

// Same tilt for the same country every time, so the page doesn't reshuffle.
const tilt = code => ((code.charCodeAt(0) * 31 + code.charCodeAt(1) * 17) % 11) - 5;
const fmt = d => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

// An ink stamp: flag, name and first-visit date, in the continent's ink, slightly rotated and worn.
export function Stamp({ code, continent, first, countries, style }) {
  return (
    <div className="stamp" style={{ '--ink': CONTINENT_HUES[continent], transform: `rotate(${tilt(code)}deg)`, ...style }}>
      <img className="stamp-flag" src={flagUrl(code)} alt="" />
      <span className="stamp-name">{countries.byCode[code]?.name}</span>
      <span className="stamp-date">{fmt(first)}</span>
    </div>
  );
}

// The worn-ink texture: rough edges by displacing the stamp with noise. Defined once, used by every stamp.
export function InkFilter() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <filter id="worn-ink">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.5" xChannelSelector="R" yChannelSelector="G" result="rough" />
        <feComponentTransfer in="noise" result="speckle"><feFuncA type="discrete" tableValues="1 1 1 0.6 1 1 0.35 1" /></feComponentTransfer>
        <feComposite in="rough" in2="speckle" operator="in" />
      </filter>
    </svg>
  );
}

import Empty from './Empty.jsx';

export default function Passport({ profile, visits, family, countries, onAdd }) {
  const people = [{ id: profile.friendId, name: profile.name, colour: profile.colour, visits }, ...family.map(f => ({ id: f.friendId, name: f.name, colour: f.colour, visits: f.visits }))];
  const [who, setWho] = useState(profile.friendId);
  const person = people.find(p => p.id === who) ?? people[0];
  const stamps = passportStamps(person.visits);

  return (
    <div className="screen passport">
      <InkFilter />
      <h1 className="title small">Passport</h1>
      {people.length > 1 && (
        <div className="chips" role="group" aria-label="Whose passport">
          {people.map(p => (
            <button key={p.id} className={p.id === person.id ? 'chip' : 'chip off'} aria-pressed={p.id === person.id} onClick={() => setWho(p.id)}>
              <span className="dot" style={{ background: p.colour }} />{p.id === profile.friendId ? 'You' : p.name}
            </button>
          ))}
        </div>
      )}
      {stamps.length > 0 && <p className="result-where">{stamps.length} {stamps.length === 1 ? 'stamp' : 'stamps'}, in the order {person.id === profile.friendId ? 'you' : person.name} first visited</p>}
      {stamps.length === 0 ? (
        person.id === profile.friendId ? (
          <Empty title="No stamps yet" text="Every country you visit gets a stamp here, in the order you first went.">
            <button className="primary" onClick={onAdd}>Add a place</button>
          </Empty>
        ) : <p className="hint">{person.name} hasn't logged a country yet.</p>
      ) : (
        <div className="stamp-page">
          {stamps.map((s, i) => (
            <motion.div key={s.code} initial={{ opacity: 0, scale: 1.15 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: Math.min(i, 20) * 0.04 }}>
              <Stamp {...s} countries={countries} />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
