import { motion } from 'motion/react';
import { continentProgress, CONTINENT_HUES } from './visits.js';

export default function Stats({ s, countries, visits, onCountry }) {
  const progress = continentProgress(s.visitedCodes, countries.list);
  const latest = {}; // newest visit date per country, to sort the list
  for (const v of visits) if (v.exitedAirport && !(latest[v.countryCode] >= v.dateFrom)) latest[v.countryCode] = v.dateFrom;

  return (
    <div className="screen stats">
      <h1 className="title small">Places I've been</h1>
      <div className="tiles">
        <div className="tile big"><span className="tile-value">{s.countries}</span><span className="tile-label">{s.countries === 1 ? 'country' : 'countries'}</span></div>
        <div className="tile"><span className="tile-value">{s.continents}<small>/7</small></span><span className="tile-label">continents</span></div>
        <div className="tile"><span className="tile-value">{s.cities}</span><span className="tile-label">{s.cities === 1 ? 'city' : 'cities'}</span></div>
        <div className="tile"><span className="tile-value">{s.worldPercent.toFixed(s.worldPercent < 10 ? 1 : 0)}%</span><span className="tile-label">of the world</span></div>
      </div>

      <h2 className="list-title">Continents</h2>
      <div className="rings">
        {progress.map(p => <Ring key={p.continent} {...p} />)}
      </div>

      <h2 className="list-title">Countries</h2>
      {s.countries === 0 && <p className="hint">Countries you visit will be listed here.</p>}
      {progress.filter(p => p.visited).map(p => (
        // Collapsed by default so a long list never pushes the next continent far down; tap to open.
        <details key={p.continent} className="group">
          <summary className="group-title">{p.continent} <span className="group-count">{p.visited}</span></summary>
          <ul className="results">
            {s.visitedCodes.filter(c => countries.byCode[c].continent === p.continent)
              .sort((a, b) => latest[b].localeCompare(latest[a]))
              .map(c => (
                <li key={c}>
                  <button className="result" onClick={() => onCountry(c)}>
                    <span className="result-name">{countries.byCode[c].name}</span>
                    <span className="result-where">Last visited {new Date(latest[c] + 'T12:00:00').getFullYear()}</span>
                  </button>
                </li>
              ))}
          </ul>
        </details>
      ))}
    </div>
  );
}

const R = 30, C = 2 * Math.PI * R;

// Visited countries out of all countries on the continent; fills when the screen opens.
function Ring({ continent, visited, total }) {
  const share = total ? visited / total : 0;
  return (
    <div className="ring" role="img" aria-label={`${continent}: ${visited} of ${total} countries`}>
      <svg viewBox="0 0 72 72" width="72" height="72">
        <circle cx="36" cy="36" r={R} className="ring-track" />
        <motion.circle cx="36" cy="36" r={R} className="ring-fill" stroke={CONTINENT_HUES[continent]} strokeDasharray={C} transform="rotate(-90 36 36)"
          initial={{ strokeDashoffset: C }} animate={{ strokeDashoffset: C * (1 - share) }} transition={{ duration: 0.8, ease: 'easeOut' }} />
        <text x="36" y="41" textAnchor="middle" className="ring-text">{visited}</text>
      </svg>
      <span className="ring-label">{continent}</span>
      <span className="ring-sub">of {total}</span>
    </div>
  );
}
