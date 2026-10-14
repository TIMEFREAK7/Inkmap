import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Stamp, InkFilter } from './Passport.jsx';
import { CONTINENT_HUES } from './visits.js';

const FLIGHT_MS = 1200; // the globe's fly-to; the stamp lands after it

// First visit to a country: the stamp drops from 1.4x to 1x with a shadow thump and a buzz on landing.
// First visit to a continent: a ring of light pulses out from where the globe has flown.
export default function Celebrate({ event, countries, onDone }) {
  const done = useRef(onDone);
  done.current = onDone;
  // Keyed on the event only: the app re-renders right after a save, which must not restart the timer.
  useEffect(() => {
    if (!event) return;
    const t = setTimeout(() => done.current(), FLIGHT_MS + 2200);
    return () => clearTimeout(t);
  }, [event]);

  return (
    <AnimatePresence>
      {event && (
        <motion.div key={event.code + event.first} className="celebrate" aria-live="polite" exit={{ opacity: 0 }} onClick={onDone}>
          <InkFilter />
          {event.newContinent && (
            <motion.span className="pulse" style={{ borderColor: CONTINENT_HUES[event.continent] }}
              initial={{ scale: 0.2, opacity: 0.9 }} animate={{ scale: 4, opacity: 0 }} transition={{ delay: FLIGHT_MS / 1000, duration: 1.2, ease: 'easeOut' }} />
          )}
          {event.newCountry && (
            <>
              <motion.span className="thump" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: [0.6, 1.15, 1], opacity: [0, 0.55, 0.35] }}
                transition={{ delay: FLIGHT_MS / 1000 + 0.32, duration: 0.35 }} />
              <motion.div className="drop" initial={{ scale: 1.4, opacity: 0, rotate: -14 }} animate={{ scale: 1, opacity: 1, rotate: 0 }}
                transition={{ delay: FLIGHT_MS / 1000, type: 'spring', stiffness: 520, damping: 22 }}
                onAnimationComplete={() => navigator.vibrate?.(35)}>
                <Stamp code={event.code} continent={event.continent} first={event.first} countries={countries} />
                <p className="drop-caption">New country!</p>
              </motion.div>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
