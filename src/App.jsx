import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import Globe from './Globe.jsx';
import FpsMeter from './FpsMeter.jsx';
import AddVisit from './AddVisit.jsx';
import Onboarding from './Onboarding.jsx';
import Settings from './Settings.jsx';
import Stats from './Stats.jsx';
import CountryView from './CountryView.jsx';
import EditVisit from './EditVisit.jsx';
import Family from './Family.jsx';
import Passport from './Passport.jsx';
import Celebrate from './Celebrate.jsx';
import Postcard from './Postcard.jsx';
import { GlobeIcon, StatsIcon, FamilyIcon, StampIcon } from './icons.jsx';
import { applyTheme, savedTheme, cssVar } from './theme.js';
import { Capacitor } from '@capacitor/core';
import { Widget } from './native.js';
import { closeTopDialog } from './sheet.jsx';
import Inbox from './Inbox.jsx';
import BoardingScan from './BoardingScan.jsx';
import { findPhotoTrips, importTimeline, importBoardingPass, importCalendar, importSheet } from './photos.js';
import { km, HOME_KM } from './backfill.js';
import { scheduleBackup, onBackupResult } from './backup.js';
import { loadCountries, startPlaces } from './data.js';
import { db } from './db.js';
import { makeVisit, stats } from './visits.js';
import { prunePhotos } from './visitPhotos.js';

const UNDO_MS = 5000;

export default function App() {
  const [countries, setCountries] = useState(null);
  const [places, setPlaces] = useState(null);
  const [visits, setVisits] = useState([]);
  const [family, setFamily] = useState([]);
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
  const [celebrate, setCelebrate] = useState(null); // new country / continent just logged
  const [inbox, setInbox] = useState(false);
  const [theme, setTheme] = useState(savedTheme);
  const [boarding, setBoarding] = useState(false); // boarding pass scanner open
  const [postcard, setPostcard] = useState(false);
  const snapRef = useRef(null); // Globe fills it: a picture of the whole globe, for the postcard
  const [suggestions, setSuggestions] = useState([]); // pending, newest trip first
  const [scan, setScan] = useState(null); // photo scan: { running, done, total } then { photos, videos, located, found } or { error }
  const [start, setStart] = useState(undefined); // where the globe faced last time; undefined while loading
  const [showFps, setShowFps] = useState(() => { try { return localStorage.getItem('inkmap.fps') === '1'; } catch { return false; } });

  const reload = () => db.visits.orderBy('createdAt').reverse().toArray().then(setVisits);
  const reloadSuggestions = () => db.suggestions.where('status').equals('pending').toArray()
    .then(l => setSuggestions(l.sort((a, b) => b.dateFrom.localeCompare(a.dateFrom))));
  const reloadFamily = () => db.family.orderBy('friendId').toArray().then(setFamily);
  const loadProfile = () => db.profile.toCollection().first().then(p => setProfile(p ?? null));
  useEffect(() => {
    loadCountries().then(setCountries, setError);
    startPlaces().then(setPlaces, setError);
    onBackupResult(setBackup);
    loadProfile();
    reload();
    reloadFamily();
    reloadSuggestions();
    db.settings.get('lastCenter').then(r => setStart(r?.value ?? null));
    prunePhotos().catch(() => {});
  }, []);
  const saveCenter = c => db.settings.put({ key: 'lastCenter', value: c });

  const s = useMemo(() => stats(visits, countries?.list.length), [visits, countries]);
  // The home-screen widget (Android) shows the same counts, in the app's colour.
  useEffect(() => {
    if (Capacitor.isNativePlatform() && countries) Widget.update({ continents: s.continents, countries: s.countries, cities: s.cities, colour: cssVar('--primary') }).catch(() => {});
  }, [s.continents, s.countries, s.cities, theme, countries]);
  // Recent places for the empty search: newest first, each place once.
  const recent = useMemo(() => {
    const seen = new Set();
    return visits.filter(v => !seen.has(v.geonameId) && seen.add(v.geonameId)).slice(0, 8)
      .map(v => ({ id: v.geonameId, name: v.name, cc: v.countryCode, admin1: v.admin1Code, lat: v.lat, lon: v.lon }));
  }, [visits]);

  const saving = useRef(false); // a quick double tap must not save the same visit twice
  async function save(place, date, dateTo, source, exitedAirport = true) {
    if (saving.current) return null;
    saving.current = true;
    try { return await saveOnce(place, date, dateTo, source, exitedAirport); } finally { saving.current = false; }
  }
  async function saveOnce(place, date, dateTo, source, exitedAirport) {
    const visit = makeVisit(place, countries.byCode[place.cc], { date, dateTo, source, exitedAirport });
    const counted = visits.filter(v => v.exitedAirport);
    const newCountry = !counted.some(v => v.countryCode === visit.countryCode);
    const newContinent = !counted.some(v => v.continent === visit.continent);
    await db.visits.add(visit);
    if (newCountry && exitedAirport) setCelebrate({ code: visit.countryCode, continent: visit.continent, first: visit.dateFrom, newCountry, newContinent });
    scheduleBackup();
    setAdding(false);
    setFocus({ lon: place.lon, lat: place.lat });
    await reload();
    navigator.vibrate?.(20);
    setUndo({ text: `Saved ${place.name}`, run: () => db.visits.delete(visit.id) });
    return visit;
  }

  // Runs at app level so it keeps going while the person closes the inbox and uses the app.
  // Imports need the place data (loaded in the background at launch).
  const notReady = () => !places && (setScan({ error: 'Inkmap is still getting places ready. Try again in a moment.' }), true);

  async function scanPhotos(files) {
    if (notReady()) return;
    setScan({ running: true, done: 0, total: 0 });
    try {
      const result = await findPhotoTrips(places, countries, files, p => setScan({ running: true, ...p }));
      setScan(result);
      scheduleBackup();
    } catch (e) {
      setScan(e.message === 'No folder chosen' ? null : { error: `Could not read photos: ${e.message}` });
    }
    reloadSuggestions();
  }

  async function calendarImport() {
    if (notReady()) return;
    setScan({ running: true, label: 'Reading your calendar', done: 0, total: 0 });
    try {
      setScan(await importCalendar(places, countries));
      scheduleBackup();
    } catch (e) {
      setScan({ error: e.message });
    }
    reloadSuggestions();
  }

  async function fileImport(label, work) {
    if (notReady()) return;
    setScan({ running: true, label, done: 0, total: 0 });
    try {
      setScan(await work());
      scheduleBackup();
    } catch (e) {
      setScan({ error: e.message });
    }
    reloadSuggestions();
  }
  const timelineImport = files => fileImport('Reading your Timeline', () => importTimeline(places, countries, files));
  const sheetImport = file => fileImport('Reading your trip list', () => importSheet(places, countries, file));

  // A boarding pass returns { found, legs }; the scanner shows what was read.
  async function boardingPassCode(text) {
    if (!places) throw new Error('Inkmap is still getting places ready. Try again in a moment.');
    const { legs, found } = await importBoardingPass(places, countries, text);
    scheduleBackup();
    reloadSuggestions();
    const fmt = d => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    const read = legs.map(l => `${l.from} → ${l.to} (${l.carrier} ${l.flight}, ${fmt(l.date)})`).join(', ');
    return found ? `Read ${read}. ${found} new ${found === 1 ? 'place' : 'places'} to check.` : `Read ${read}. Nothing new: it's already in your places or it's your home town.`;
  }

  // exited: false for a boarding pass stop where the person only changed planes (kept, but not counted).
  async function confirmSuggestion(sg, exited = true) {
    const place = { id: sg.geonameId, name: sg.name, cc: sg.countryCode, admin1: sg.admin1Code, lat: sg.lat, lon: sg.lon };
    // Only once: a double tap, or a tap during the swipe-away, finds it no longer pending.
    if (!(await db.suggestions.where('id').equals(sg.id).and(s => s.status === 'pending').modify({ status: 'confirmed' }))) return;
    const visit = await save(place, sg.dateFrom, sg.dateTo, sg.source, exited);
    if (!visit) return;
    reloadSuggestions();
    setUndo({ text: `Added ${sg.name}`, run: () => Promise.all([db.visits.delete(visit.id), db.suggestions.update(sg.id, { status: 'pending' })]) });
  }

  // Home town: its photos are everyday life, so they are skipped from now on. It still counts once as a place you've been.
  async function setHome(sg) {
    const home = { geonameId: sg.geonameId, name: sg.name, lat: sg.lat, lon: sg.lon };
    const around = suggestions.filter(x => km(x.lat, x.lon, home.lat, home.lon) < HOME_KM);
    const before = await db.settings.get('home'); // Undo brings back the previous home town, if there was one
    await db.settings.put({ key: 'home', value: home });
    await db.suggestions.bulkUpdate(around.map(x => ({ key: x.id, changes: { status: 'rejected' } })));
    const logged = visits.some(v => v.geonameId === sg.geonameId);
    const first = around.filter(x => x.geonameId === sg.geonameId).reduce((a, x) => (x.dateFrom < a.dateFrom ? x : a), sg);
    const place = { id: sg.geonameId, name: sg.name, cc: sg.countryCode, admin1: sg.admin1Code, lat: sg.lat, lon: sg.lon };
    const visit = logged ? null : await save(place, first.dateFrom, undefined, 'photo');
    scheduleBackup();
    reloadSuggestions();
    setUndo({
      text: `Home set to ${sg.name}`,
      run: () => Promise.all([
        before ? db.settings.put(before) : db.settings.delete('home'),
        db.suggestions.bulkUpdate(around.map(x => ({ key: x.id, changes: { status: 'pending' } }))),
        visit && db.visits.delete(visit.id),
      ]),
    });
  }

  async function rejectSuggestion(sg) {
    await db.suggestions.update(sg.id, { status: 'rejected' });
    scheduleBackup();
    reloadSuggestions();
    setUndo({ text: `Skipped ${sg.name}`, run: () => db.suggestions.update(sg.id, { status: 'pending' }) });
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
    reloadSuggestions();
  }

  async function saveProfile(changes) {
    await db.profile.update(profile.friendId, changes);
    scheduleBackup();
    loadProfile();
  }

  // Android back gesture (MainActivity): close the topmost screen; false means nothing was open, so leave the app.
  useEffect(() => {
    window.inkmapBack = () => {
      if (closeTopDialog()) return true;
      if (postcard) setPostcard(false);
      else if (boarding) setBoarding(false);
      else if (editing) setEditing(null);
      else if (country) setCountry(null);
      else if (adding) setAdding(false);
      else if (inbox) setInbox(false);
      else if (settings) setSettings(false);
      else if (tab !== 'globe') setTab('globe');
      else return false;
      return true;
    };
  });
  useEffect(() => {
    const esc = e => { if (e.key === 'Escape') window.inkmapBack?.(); };
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  }, []);

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
        <main><Onboarding onDone={() => { loadProfile(); reload(); reloadFamily(); reloadSuggestions(); }} /></main>
      </MotionConfig>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <main>
        {countries && start !== undefined && <Globe geo={countries.geo} visited={s.visitedCodes} colour={profile.colour} focus={focus}
          start={start} onLeave={saveCenter} theme={theme} snapRef={snapRef} paused={tab !== 'globe' || !!country || adding || settings || inbox} onCountry={setCountry} />}
        <button className="avatar" style={{ background: profile.colour }} aria-label="Settings and backup" onClick={() => setSettings(true)}>
          {profile.name[0]?.toUpperCase()}
        </button>
        {backup && !backup.ok && <button className="backup-warn" onClick={() => setSettings(true)}>Backup failed. Tap to fix.</button>}
        <header className="counters" aria-label="Places I've been">
          <Counter value={s.continents} label={s.continents === 1 ? 'continent' : 'continents'} />
          <Counter value={s.countries} label={s.countries === 1 ? 'country' : 'countries'} />
          <Counter value={s.cities} label={s.cities === 1 ? 'city' : 'cities'} />
        </header>
        {showFps && <FpsMeter />}
        {error && <p className="error" role="alert">Something went wrong loading the map data: {String(error)}</p>}
        {tab === 'stats' && countries && <Stats s={s} countries={countries} visits={visits} onCountry={setCountry} onAdd={() => setAdding(true)} onFind={() => setInbox(true)} onPostcard={() => setPostcard(true)} />}
        {tab === 'passport' && countries && <Passport profile={profile} visits={visits} family={family} countries={countries} onAdd={() => setAdding(true)} />}
        {tab === 'family' && countries && <Family profile={profile} visits={visits} family={family} countries={countries} onChanged={reloadFamily} />}

        <div className="bottom">
          {tab === 'globe' && (scan?.running || suggestions.length > 0) && (
            <button className="inbox-pill" onClick={() => setInbox(true)}>
              {scan?.running ? `${scan.label || 'Reading photos'}${scan.total ? ` · ${Math.round((scan.done / scan.total) * 100)}%` : '…'}`
                : `${suggestions.length} ${suggestions.length === 1 ? 'place' : 'places'} to check`}
            </button>
          )}
          {visits.length === 0 && tab === 'globe' && <p className="empty">Tap + to add your first place</p>}
          <nav className="tabs" aria-label="Screens">
            <button className={tab === 'globe' ? 'tab on' : 'tab'} aria-current={tab === 'globe' ? 'page' : undefined} onClick={() => setTab('globe')}><GlobeIcon />Globe</button>
            <button className={tab === 'stats' ? 'tab on' : 'tab'} aria-current={tab === 'stats' ? 'page' : undefined} onClick={() => setTab('stats')}><StatsIcon />Stats</button>
            <button className="fab" aria-label="Add a place" onClick={() => setAdding(true)} disabled={!countries}>+</button>
            <button className={tab === 'family' ? 'tab on' : 'tab'} aria-current={tab === 'family' ? 'page' : undefined} onClick={() => setTab('family')}><FamilyIcon />Family</button>
            <button className={tab === 'passport' ? 'tab on' : 'tab'} aria-current={tab === 'passport' ? 'page' : undefined} onClick={() => setTab('passport')}><StampIcon />Stamps</button>
          </nav>
        </div>

        <AnimatePresence>
          {adding && <AddVisit places={places} countries={countries} recent={recent} onSave={save} onClose={() => setAdding(false)}
            onFind={() => { setAdding(false); setInbox(true); }} />}
          {country && <CountryView key={country} code={country} countries={countries} visits={visits} colour={profile.colour}
            onEdit={setEditing} onClose={() => setCountry(null)} />}
          {postcard && <Postcard snapRef={snapRef} profile={profile} s={s} visits={visits} onClose={() => setPostcard(false)} />}
          {editing && <EditVisit key={editing.id} visit={editing} where={where(editing)} onSave={saveEdit} onDelete={deleteVisit} onClose={() => setEditing(null)} />}
          {inbox && <Inbox suggestions={suggestions} scan={scan} where={where} onScan={scanPhotos} onTimeline={timelineImport} onSheet={sheetImport} onCalendar={calendarImport}
            onConfirm={confirmSuggestion} onReject={rejectSuggestion} onHome={setHome} onBoarding={() => setBoarding(true)} onClose={() => setInbox(false)} />}
          {boarding && <BoardingScan onCode={boardingPassCode} onClose={() => setBoarding(false)} />}
          {settings && <Settings profile={profile} backup={backup} onSaveProfile={saveProfile} onClose={() => setSettings(false)}
            onPhotos={() => { setSettings(false); setInbox(true); }}
            theme={theme} onTheme={id => { applyTheme(id); setTheme(id); }}
            showFps={showFps} onShowFps={on => { setShowFps(on); try { localStorage.setItem('inkmap.fps', on ? '1' : '0'); } catch { /* private mode */ } }} />}
        </AnimatePresence>

        {countries && <Celebrate event={celebrate} countries={countries} onDone={() => setCelebrate(null)} />}
        {/* Always mounted, so screen readers announce each change (a region that appears with its text is often skipped). */}
        <div className="sr-only" role="status" aria-live="polite">
          {celebrate ? `New country: ${countries?.byCode[celebrate.code]?.name}.` : ''} {undo?.text ? `${undo.text}. Undo is available.` : ''}
        </div>

        {/* Last in the tree so it sits above every screen: undo must be reachable wherever the change was made. */}
        <AnimatePresence>
          {undo && (
            <motion.div className={adding || country || editing || settings || inbox || boarding || postcard ? 'undo low' : 'undo'} initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}>
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
      <Odometer value={value} />
      <span className="counter-label">{label}</span>
    </div>
  );
}

// Digits roll like an odometer when a count changes. Columns are keyed from the right so the units digit keeps rolling.
function Odometer({ value }) {
  const digits = String(value).split('');
  return (
    <span className="counter-value odo" role="img" aria-label={String(value)}>
      {digits.map((d, i) => (
        <span key={digits.length - i} className="odo-col" aria-hidden="true">
          <motion.span className="odo-strip" initial={false} animate={{ y: `${-d * 10}%` }} transition={{ type: 'spring', stiffness: 140, damping: 22 }}>
            {'0123456789'.split('').map(n => <span key={n}>{n}</span>)}
          </motion.span>
        </span>
      ))}
    </span>
  );
}
