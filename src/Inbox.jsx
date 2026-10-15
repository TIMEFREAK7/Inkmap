import { useRef, useState } from 'react';
import { animate, motion, useMotionValue, useTransform } from 'motion/react';
import { useSheetDrag } from './sheet.jsx';
import { describeDates } from './visits.js';
import { flagUrl } from './flags.js';
import { scansLibrary } from './photos.js';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Suggestions inbox: one card at a time. Swipe right (or tap Yes) to add it as a visit, left (or Not me) to drop it.
export default function Inbox({ suggestions, scan, where, onScan, onTimeline, onBoarding, onConfirm: confirm, onReject, onHome, onClose }) {
  const [asking, setAsking] = useState(null); // boarding pass suggestion waiting for "Did you leave the airport?"
  // A boarding pass alone doesn't show the person left the airport, so confirming asks.
  const onConfirm = s => (s.source === 'boardingPass' ? setAsking(s) : confirm(s));
  const drag = useSheetDrag(onClose);
  const fileRef = useRef(null);
  const timelineRef = useRef(null);
  const [top, next] = suggestions;

  function start() {
    if (scansLibrary) onScan(null);
    else fileRef.current.click();
  }

  return (
    <motion.div className="sheet" {...drag.sheet} role="dialog" aria-label="Places to check"
      initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 400, damping: 40 }}>
      {drag.handle}
      <div className="sheet-head">
        <h1 className="title small">Places to check</h1>
        <button className="text-button" onClick={onClose}>Done</button>
      </div>

      {scan?.running && (
        <div className="scan" role="status">
          <p>{scan.label || 'Reading your photos'}{scan.total ? ` · ${scan.done} of ${scan.total}` : '…'}</p>
          <div className="bar"><div style={{ width: `${scan.total ? (scan.done / scan.total) * 100 : 5}%` }} /></div>
          <p className="hint">You can keep using Inkmap while this runs.</p>
        </div>
      )}
      {scan?.error && <p className="warn" role="alert">{scan.error}</p>}
      {scan?.timelineVisits != null && (
        <p className="hint scan-summary">Read {plural(scan.timelineVisits, 'Timeline visit', 'Timeline visits')}{' · '}{plural(scan.found, 'new place', 'new places')}</p>
      )}
      {scan?.photos != null && (
        <p className="hint scan-summary">
          Read {plural(scan.photos, 'photo', 'photos')}{scan.videos ? ` and ${plural(scan.videos, 'video', 'videos')}` : ''}
          {' · '}{scan.located} with a location{' · '}{plural(scan.found, 'new place', 'new places')}
        </p>
      )}

      {top ? (
        <>
          <p className="hint">{plural(suggestions.length, 'place', 'places')} to check. Were you there?</p>
          <div className="deck">
            {next && <Card key={next.id} s={next} where={where(next)} behind />}
            <Card key={top.id} s={top} where={where(top)} onConfirm={() => onConfirm(top)} onReject={() => onReject(top)} />
          </div>
          <div className="deck-buttons">
            <button className="secondary" onClick={() => onReject(top)}>Not me</button>
            <button className="primary" onClick={() => onConfirm(top)}>Yes, I was there</button>
          </div>
          <button className="text-button home-button" onClick={() => onHome(top)}>I live in {top.name}</button>
        </>
      ) : !scan?.running && (
        <div className="inbox-empty">
          {scan?.found === 0 && <p>No new places found.</p>}
          {scan?.found > 0 && <p>All done. Every place has been checked.</p>}
          <p className="hint">
            {scansLibrary
              ? 'Inkmap reads where and when each photo on this phone was taken, and suggests the cities. Only the place and date are kept; your photos never leave the phone and are not copied.'
              : 'Pick photos and Inkmap reads where and when each one was taken, and suggests the cities. Only the place and date are kept; the photos are not copied.'}
          </p>
          {scansLibrary && (
            <>
              <p className="hint">Photos missing? Some phones hide part of the camera roll from other apps. Pick the folder itself (usually DCIM, then Camera) and Inkmap reads every file in it.</p>
              <button className="secondary" onClick={() => onScan('folder')}>Choose a folder</button>
            </>
          )}
          <p className="hint">Boarding passes: scan the barcode on a paper pass, or a screenshot of one from an airline app.</p>
          <button className="secondary" onClick={onBoarding}>Scan a boarding pass</button>
          <p className="hint">Google Maps Timeline: on your phone open Settings, Location, Location services, Timeline, then Export Timeline data. Pick the Timeline.json file it saves.</p>
          <button className="secondary" onClick={() => timelineRef.current.click()}>Import Google Maps Timeline</button>
          <button className="primary" onClick={start}>{scansLibrary ? 'Look through my photos' : 'Choose photos'}</button>
        </div>
      )}
      {asking && (
        <div className="scrim">
          <div className="dialog" role="alertdialog" aria-label="Did you leave the airport?">
            <h2 className="dialog-title">Did you leave the airport in {asking.name}?</h2>
            <p className="hint">Only places where you went outside the airport count toward your countries and cities.</p>
            <button className="primary" onClick={() => { confirm(asking, true); setAsking(null); }}>Yes, I went into {asking.name}</button>
            <button className="secondary" onClick={() => { confirm(asking, false); setAsking(null); }}>No, I only changed planes</button>
          </div>
        </div>
      )}
      <input ref={timelineRef} type="file" accept=".json,application/json" multiple hidden
        onChange={e => { const files = [...e.target.files]; e.target.value = ''; if (files.length) onTimeline(files); }} />
      <input ref={fileRef} type="file" accept="image/*" multiple hidden
        onChange={e => { const files = [...e.target.files]; e.target.value = ''; if (files.length) onScan(files); }} />
    </motion.div>
  );
}

// The top card follows the finger, tilting and tinting green (yes) or red (no); past the threshold it flies off.
function Card({ s, where, behind, onConfirm, onReject }) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-12, 12]);
  const tint = useTransform(x, [-150, 0, 150], ['#4a2236', '#1b2547', '#1d4a3c']);

  async function release(_, info) {
    const dir = info.offset.x > 110 || info.velocity.x > 600 ? 1 : info.offset.x < -110 || info.velocity.x < -600 ? -1 : 0;
    if (!dir) return animate(x, 0, { type: 'spring', stiffness: 500, damping: 35 });
    await animate(x, dir * 500, { duration: 0.2 });
    (dir > 0 ? onConfirm : onReject)();
  }

  return (
    <motion.div className="suggestion" aria-hidden={behind || undefined}
      style={behind ? undefined : { x, rotate, backgroundColor: tint }}
      initial={false} animate={{ scale: behind ? 0.94 : 1, y: behind ? 14 : 0 }}
      drag={behind ? false : 'x'} dragSnapToOrigin={false} onDragEnd={behind ? undefined : release}>
      <img className="suggestion-flag" src={flagUrl(s.countryCode)} alt="" />
      <p className="suggestion-name">{s.name}</p>
      <p className="result-where">{where}</p>
      <p className="suggestion-date">{describeDates(s)}</p>
      <p className="hint">{s.source === 'timeline' ? 'From Google Maps Timeline'
        : s.flight ? `Flight ${s.flight.carrier} ${s.flight.number} · ${s.flight.from} → ${s.flight.to}` : plural(s.photos, 'photo', 'photos')}</p>
    </motion.div>
  );
}
