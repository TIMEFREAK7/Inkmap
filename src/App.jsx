import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import Globe from './Globe.jsx';
import FpsMeter from './FpsMeter.jsx';
import AddVisit from './AddVisit.jsx';
import Onboarding from './Onboarding.jsx';
import Settings from './Settings.jsx';
import Stats from './Stats.jsx';
import CountryView from './CountryView.jsx';
import EditVisit from './EditVisit.jsx';
import { scheduleBackup, onBackupResult } from './backup.js';
import { loadCountries, startPlaces } from './data.js';
import { db } from './db.js';
import { makeVisit, stats } from './visits.js';

const UNDO_MS = 5000;

export default function App() {
  const [countries, setCountries] = useState(null);
  const [places, setPlaces] = useState(null);
  const [visits, setVisits] = useState([]);
  const [adding, setAdding] = useState(false);
  const [focus, setFocus] = useState(null);
  const [undo, setUndo] = useState(null);
  const [error, setError] = useState(null);
  const [profile, setProfile] = useState(undefined); // undefined while loading, null before first launch is done
  const [settings, setSettings] = useState(false);
  const [backup, setBackup] = useState(null);
  const [tab, setTab] = useState('globe');
  const [country, setCountry] = useState(null);
  const [editing, setEditing] = useState(null);

  const reload = () => db.visits.orderBy('createdAt').reverse().toArray().then(setVisits);
  const loadProfile = () => db.profile.toCollection().first().then(p => setProfile(p ?? null));
  useEffect(() => {
    loadCountries().then(setCountries, setError);
    startPlaces().then(setPlaces, setError);
    onBackupResult(setBackup);
    loadProfile();
    reload();
  }, []);

  const s = useMemo(() => stats(visits, countries?.list.length), [visits, countries]);
  // Recent places for the empty search: newest first, each place once.
  const recent = useMemo(() => {
    const seen = new Set();
    return visits.filter(v => !seen.has(v.geonameId) && seen.add(v.geonameId)).slice(0, 8)
      .map(v => ({ id: v.geonameId, name: v.name, cc: v.countryCode, admin1: v.admin1Code, lat: v.lat, lon: v.lon }));
  }, [visits]);

  async function save(place, date, dateTo) {
    const visit = makeVisit(place, countries.byCode[place.cc], { date, dateTo });
    await db.visits.add(visit);
    scheduleBackup();
    setAdding(false);
    setFocus({ lon: place.lon, lat: place.lat });
    await reload();
    navigator.vibrate?.(20);
    setUndo({ text: `Saved ${place.name}`, run: () => db.visits.delete(visit.id) });
  }

  async function saveEdit(changes) {
    await db.visits.update(editing.id, { ...changes, updatedAt: new Date().toISOString() });
    scheduleBackup();
    setEditing(null);
    reload();
  }

  // No "Are you sure?": deleting shows Undo for 5 seconds instead.
  async function deleteVisit() {
    const visit = editing;
    await db.visits.delete(visit.id);
    scheduleBackup();
    setEditing(null);
    reload();
    setUndo({ text: `Deleted ${visit.name}`, run: () => db.visits.add(visit) });
  }

  async function undoLast() {
    const { run } = undo;
    setUndo(null);
    await run();
    scheduleBackup();
    reload();
  }

  async function saveProfile(changes) {
    await db.profile.update(profile.friendId, changes);
    scheduleBackup();
    loadProfile();
  }

  const where = v => [countries.admin1[`${v.countryCode}.${v.admin1Code}`], countries.byCode[v.countryCode]?.name].filter(Boolean).join(', ');

  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), UNDO_MS);
    return () => clearTimeout(t);
  }, [undo]);

  if (profile === undefined) return <main />;
  if (profile === null) {
    return (
      <MotionConfig reducedMotion="user">
        <main><Onboarding onDone={() => { loadProfile(); reload(); }} /></main>
      </MotionConfig>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <main>
        {countries && <Globe geo={countries.geo} visited={s.visitedCodes} colour={profile.colour} focus={focus}
          paused={tab !== 'globe' || !!country || adding || settings} onCountry={setCountry} />}
        <button className="avatar" style={{ background: profile.colour }} aria-label="Settings and backup" onClick={() => setSettings(true)}>
          {profile.name[0]?.toUpperCase()}
        </button>
        {backup && !backup.ok && <button className="backup-warn" onClick={() => setSettings(true)}>Backup failed. Tap to fix.</button>}
        <header className="counters" aria-label="Places I've been">
          <Counter value={s.continents} label={s.continents === 1 ? 'continent' : 'continents'} />
          <Counter value={s.countries} label={s.countries === 1 ? 'country' : 'countries'} />
          <Counter value={s.cities} label={s.cities === 1 ? 'city' : 'cities'} />
        </header>
        <FpsMeter />
        {error && <p className="error" role="alert">Something went wrong loading the map data: {String(error)}</p>}
        {tab === 'stats' && countries && <Stats s={s} countries={countries} visits={visits} onCountry={setCountry} />}

        <div className="bottom">
          {visits.length === 0 && tab === 'globe' && <p className="empty">Tap + to add your first place</p>}
          <nav className="tabs" aria-label="Screens">
            <button className={tab === 'globe' ? 'tab on' : 'tab'} aria-current={tab === 'globe'} onClick={() => setTab('globe')}>Globe</button>
            <button className="fab" aria-label="Add a place" onClick={() => setAdding(true)} disabled={!countries}>+</button>
            <button className={tab === 'stats' ? 'tab on' : 'tab'} aria-current={tab === 'stats'} onClick={() => setTab('stats')}>Stats</button>
          </nav>
        </div>

        <AnimatePresence>
          {adding && <AddVisit places={places} countries={countries} recent={recent} onSave={save} onClose={() => setAdding(false)} />}
          {country && <CountryView key={country} code={country} countries={countries} visits={visits} colour={profile.colour}
            onEdit={setEditing} onClose={() => setCountry(null)} />}
          {editing && <EditVisit key={editing.id} visit={editing} where={where(editing)} onSave={saveEdit} onDelete={deleteVisit} onClose={() => setEditing(null)} />}
          {settings && <Settings profile={profile} backup={backup} onSaveProfile={saveProfile} onClose={() => setSettings(false)} />}
        </AnimatePresence>

        {/* Last in the tree so it sits above every screen: undo must be reachable wherever the change was made. */}
        <AnimatePresence>
          {undo && (
            <motion.div className="undo" role="status" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}>
              <span>{undo.text}</span>
              <button className="text-button" onClick={undoLast}>Undo</button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </MotionConfig>
  );
}

function Counter({ value, label }) {
  return (
    <div className="counter">
      <motion.span key={value} className="counter-value" initial={{ y: -12, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>{value}</motion.span>
      <span className="counter-label">{label}</span>
    </div>
  );
}
