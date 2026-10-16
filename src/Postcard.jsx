import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { useSheetDrag } from './sheet.jsx';
import { centreOf, drawPostcard } from './postcard.js';
import { cssVar } from './theme.js';
import { shareFile } from './native.js';

// Preview first, so the person sees exactly what they're sending.
export default function Postcard({ snapRef, profile, s, visits, onClose }) {
  const drag = useSheetDrag(onClose);
  const [card, setCard] = useState(null); // { blob, url }
  const [message, setMessage] = useState('');

  useEffect(() => {
    let url;
    (async () => {
      try {
        if (!snapRef.current) throw new Error('the globe is still loading');
        const globe = await snapRef.current(centreOf(visits.filter(v => v.exitedAirport)));
        const colours = Object.fromEntries(Object.entries({ space: '--map-space', primary: '--primary', glow: '--glow-2', text: '--on-surface', muted: '--on-surface-variant' })
          .map(([k, v]) => [k, cssVar(v)]));
        const blob = await drawPostcard(globe, { name: profile.name, s, colours });
        url = URL.createObjectURL(blob);
        setCard({ blob, url });
      } catch (e) {
        setMessage(`Could not make the postcard: ${e.message}`);
      }
    })();
    return () => url && URL.revokeObjectURL(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function share() {
    try {
      await shareFile(new File([card.blob], 'inkmap-postcard.jpg', { type: 'image/jpeg' }), 'My Inkmap');
    } catch (e) {
      if (e.name !== 'AbortError') setMessage(`Could not share: ${e.message}`);
    }
  }

  return (
    <motion.div className="sheet" {...drag.sheet} role="dialog" aria-modal="true" aria-label="Postcard"
      initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 400, damping: 40 }}>
      {drag.handle}
      <div className="sheet-head">
        <h1 className="title small">Postcard</h1>
        <button className="text-button" onClick={onClose}>Done</button>
      </div>
      <div className="postcard">
        {card ? <img src={card.url} alt={`${profile.name}'s world: ${s.countries} countries, ${s.continents} continents, ${s.cities} cities`} />
          : !message && <p className="hint" role="status">Making your postcard…</p>}
      </div>
      {message && <p className="warn" role="alert">{message}</p>}
      <button className="primary" disabled={!card} onClick={share}>Share</button>
    </motion.div>
  );
}
