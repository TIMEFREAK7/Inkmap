import { motion } from 'motion/react';
import { continentProgress, CONTINENT_HUES, byYear } from './visits.js';
import Empty from './Empty.jsx';

export default function Stats({ s, countries, visits, onCountry, onAdd, onFind }) {
  const progress = continentProgress(s.visitedCodes, countries.list);
  const latest = {}; // newest visit date per country, to sort the list
  for (const v of visits) if (v.exitedAirport && !(latest[v.countryCode] >= v.dateFrom)) latest[v.countryCode] = v.dateFrom;

  if (s.countries === 0) {
    return (
      <div className="screen stats">
        <h1 className="title small">Places I've been</h1>
        <Empty title="Nothing here yet" text="Add the places you've been and this page fills in: countries, continents and a timeline by year.">
          <button className="primary" onClick={onAdd}>Add a place</button>
          <button className="secondary" onClick={onFind}>Find them in my photos</button>
        </Empty>
      </div>
    );
  }
  const years = byYear(visits);
  const most = Math.max(...years.map(y => y.cities));

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

      <h2 className="list-title">By year</h2>
      <ol className="years">
        {years.map((y, i) => (
          <li key={y.year} className="year">
            <span className="year-label">{y.year}</span>
            <span className="year-bar-track">
              {/* Bars grow when the screen opens (transform only: no layout work per frame). */}
              <motion.span className="year-bar" style={{ width: `${(y.cities / most) * 100}%` }}
                initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.6, delay: i * 0.05, ease: 'easeOut' }} />
            </span>
            <span className="year-text">
              {y.cities} {y.cities === 1 ? 'city' : 'cities'} · {y.countries} {y.countries === 1 ? 'country' : 'countries'}
              {y.newCountries > 0 && <b> · {y.newCountries} new</b>}
            </span>
          </li>
        ))}
      </ol>

      <h2 className="list-title">Countries</h2>
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
