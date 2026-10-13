import { useEffect, useMemo, useRef } from 'react';
import { Map as MapLibreMap } from 'maplibre-gl';
import { motion } from 'motion/react';
import { loadStates } from './data.js';
import { fitBox, stateFor } from './geo.js';
import { describeDates } from './visits.js';

// One country on a flat map: visited states shaded, visited cities as pins, and the list of visits.
export default function CountryView({ code, countries, visits, colour, onEdit, onClose }) {
  const el = useRef(null);
  const country = countries.byCode[code];
  const shape = useMemo(() => countries.geo.features.find(f => f.properties.iso === code), [countries, code]);
  const mine = useMemo(() => visits.filter(v => v.countryCode === code)
    .sort((a, b) => b.dateFrom.localeCompare(a.dateFrom)), [visits, code]);
  const pins = useMemo(() => ({
    type: 'FeatureCollection',
    features: mine.map(v => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [v.lon, v.lat] }, properties: {} })),
  }), [mine]);

  useEffect(() => {
    if (!shape) return;
    let closed = false;
    const counted = mine.filter(v => v.exitedAirport);
    const map = new MapLibreMap({
      container: el.current, attributionControl: false,
      bounds: fitBox(shape, mine.map(v => [v.lon, v.lat])), fitBoundsOptions: { padding: 32 },
      pixelRatio: Math.min(devicePixelRatio, 2), canvasContextAttributes: { antialias: true },
      style: {
        version: 8,
        sources: { country: { type: 'geojson', data: shape }, pins: { type: 'geojson', data: pins } },
        layers: [
          { id: 'sea', type: 'background', paint: { 'background-color': '#0b1026' } },
          { id: 'land', type: 'fill', source: 'country', paint: { 'fill-color': '#3b4a63' } },
          { id: 'pins', type: 'circle', source: 'pins', paint: { 'circle-radius': 4, 'circle-color': '#fff', 'circle-stroke-width': 1.5, 'circle-stroke-color': colour } },
        ],
      },
    });
    // States arrive a moment later (1.2 MB, cached after the first country).
    loadStates().then(all => {
      if (closed) return;
      const here = all.features.filter(f => f.properties.iso_a2 === code);
      // Shade the state each visited place is in. By position, not by code: for the UK, Italy and Spain
      // Natural Earth's state codes never match GeoNames'.
      const visited = [...new Set(counted.map(v => stateFor(v.lon, v.lat, here)).filter(Boolean))];
      const add = () => {
        map.addSource('states', { type: 'geojson', data: { type: 'FeatureCollection', features: here } });
        map.addSource('visited', { type: 'geojson', data: { type: 'FeatureCollection', features: visited } });
        // The detailed states become the land, so coasts match the shading (the country outline is globe-quality).
        map.addLayer({ id: 'state-land', type: 'fill', source: 'states', paint: { 'fill-color': '#3b4a63' } }, 'pins');
        if (here.length) map.setLayoutProperty('land', 'visibility', 'none');
        map.addLayer({ id: 'visited', type: 'fill', source: 'visited', paint: { 'fill-color': colour, 'fill-opacity': 0.9 } }, 'pins');
        map.addLayer({ id: 'borders', type: 'line', source: 'states', paint: { 'line-color': '#0b1026', 'line-width': 1 } }, 'pins');
      };
      if (map.loaded()) add(); else map.once('load', add);
    });
    return () => { closed = true; map.remove(); };
  }, [shape, pins, mine, colour, code]);

  const cities = new Set(mine.filter(v => v.exitedAirport).map(v => v.geonameId)).size;

  return (
    <motion.div className="sheet country" role="dialog" aria-label={country?.name}
      initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.25 }}>
      <div className="sheet-head">
        <h1 className="title small">{country?.name}</h1>
        <button className="text-button" onClick={onClose}>Close</button>
      </div>
      <p className="result-where">{country?.continent} · {cities} {cities === 1 ? 'city' : 'cities'}</p>
      <div ref={el} className="country-map" />
      {mine.length === 0 ? (
        <p className="hint">You haven't logged a place here yet. Tap + on the globe to add one.</p>
      ) : (
        <ul className="results">
          {mine.map(v => (
            <li key={v.id}>
              <button className="result" onClick={() => onEdit(v)}>
                <span className="result-name">{v.name}</span>
                <span className="result-where">{describeDates(v)}{v.note ? ` · ${v.note}` : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </motion.div>
  );
}
