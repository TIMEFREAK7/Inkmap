import { useEffect, useMemo, useRef } from 'react';
import { Map as MapLibreMap } from 'maplibre-gl';
import { motion } from 'motion/react';
import { loadStates } from './data.js';
import { bboxOf } from './geo.js';
import { describeDates } from './visits.js';

// One country on a flat map: visited states shaded, visited cities as pins, and the list of visits.
export default function CountryView({ code, countries, visits, colour, onEdit, onClose }) {
  const el = useRef(null);
  const country = countries.byCode[code];
  const shape = useMemo(() => countries.geo.features.find(f => f.properties.iso === code), [countries, code]);
  const mine = useMemo(() => visits.filter(v => v.countryCode === code)
    .sort((a, b) => b.dateFrom.localeCompare(a.dateFrom)), [visits, code]);
  const visitedStates = useMemo(() => [...new Set(mine.filter(v => v.exitedAirport).map(v => `${code}.${v.admin1Code}`))], [mine, code]);
  const pins = useMemo(() => ({
    type: 'FeatureCollection',
    features: mine.map(v => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [v.lon, v.lat] }, properties: {} })),
  }), [mine]);

  useEffect(() => {
    if (!shape) return;
    const map = new MapLibreMap({
      container: el.current, attributionControl: false,
      bounds: bboxOf(shape), fitBoundsOptions: { padding: 32 },
      pixelRatio: Math.min(devicePixelRatio, 2), canvasContextAttributes: { antialias: true },
      style: {
        version: 8,
        sources: { country: { type: 'geojson', data: shape }, pins: { type: 'geojson', data: pins } },
        layers: [
          { id: 'sea', type: 'background', paint: { 'background-color': '#0b1026' } },
          { id: 'land', type: 'fill', source: 'country', paint: { 'fill-color': '#3b4a63' } },
          { id: 'pins', type: 'circle', source: 'pins', paint: { 'circle-radius': 6, 'circle-color': '#fff', 'circle-stroke-width': 2, 'circle-stroke-color': colour } },
        ],
      },
    });
    // States arrive a moment later (1.2 MB, cached after the first country).
    loadStates().then(states => {
      if (!map.getStyle()) return; // view already closed
      const add = () => {
        map.addSource('states', { type: 'geojson', data: states });
        const here = ['==', ['get', 'iso_a2'], code];
        map.addLayer({ id: 'visited', type: 'fill', source: 'states', filter: ['all', here, ['in', ['get', 'gn_a1_code'], ['literal', visitedStates]]], paint: { 'fill-color': colour, 'fill-opacity': 0.9 } }, 'pins');
        map.addLayer({ id: 'borders', type: 'line', source: 'states', filter: here, paint: { 'line-color': '#0b1026', 'line-width': 1 } }, 'pins');
      };
      if (map.isStyleLoaded()) add(); else map.once('load', add);
    });
    return () => map.remove();
  }, [shape, pins, visitedStates, colour, code]);

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
