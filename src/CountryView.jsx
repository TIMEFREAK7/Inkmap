import { useEffect, useMemo, useRef, useState } from 'react';
import { Map as MapLibreMap } from 'maplibre-gl';
import { cssVar } from './theme.js';
import { motion } from 'motion/react';
import { useSheetDrag } from './sheet.jsx';
import { loadRegions } from './data.js';
import { fitBox, areaFor, bboxOf } from './geo.js';
import { describeDates } from './visits.js';

// One country on a flat map: visited states shaded, visited cities as pins, and the list of visits.
export default function CountryView({ code, countries, visits, colour, onEdit, onClose }) {
  const drag = useSheetDrag(onClose);
  const el = useRef(null);
  const [areas, setAreas] = useState({}); // visit id -> 'District, State', once boundaries load
  const mapRef = useRef(null);
  const districtRef = useRef({}); // visit id -> district feature, to zoom to
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
          { id: 'sea', type: 'background', paint: { 'background-color': cssVar('--surface-container') } }, // the map reads as a card
          { id: 'land', type: 'fill', source: 'country', paint: { 'fill-color': cssVar('--map-land') } },
          { id: 'pins', type: 'circle', source: 'pins', paint: { 'circle-radius': 4, 'circle-color': '#fff', 'circle-stroke-width': 1.5, 'circle-stroke-color': colour } },
        ],
      },
    });
    // States and districts arrive a moment later (this country's file, cached after the first open).
    loadRegions(code).then(regions => {
      if (closed || !regions) return;
      const { adm1 = [], adm2 = [] } = regions;
      // Shade the district each visited place is in strongly, and its state lightly. By position: codes differ
      // between GeoNames and the boundary sources.
      const pick = list => [...new Set(counted.map(v => areaFor(v.lon, v.lat, list)).filter(Boolean))];
      // Some sources pack two languages into one name ("Lower Mainland--Southwest / L*"): keep the first.
      const clean = n => n?.split(' / ')[0].replace(/--/g, '–').replace(/\*$/, '');
      districtRef.current = Object.fromEntries(mine.map(v => [v.id, areaFor(v.lon, v.lat, adm2)]));
      setAreas(Object.fromEntries(mine.map(v => [v.id, [districtRef.current[v.id], areaFor(v.lon, v.lat, adm1)]
        .map(f => clean(f?.properties.shapeName)).filter((n, i, a) => n && a.indexOf(n) === i).join(', ')])));
      const fc = features => ({ type: 'FeatureCollection', features });
      const add = () => {
        map.addSource('adm1', { type: 'geojson', data: fc(adm1) });
        map.addSource('adm2', { type: 'geojson', data: fc(adm2) });
        map.addSource('seen1', { type: 'geojson', data: fc(pick(adm1)) });
        map.addSource('seen2', { type: 'geojson', data: fc(pick(adm2)) });
        // The detailed states become the land, so coasts match the shading (the country outline is globe-quality).
        map.addLayer({ id: 'state-land', type: 'fill', source: adm1.length ? 'adm1' : 'adm2', paint: { 'fill-color': cssVar('--map-land') } }, 'pins');
        map.setLayoutProperty('land', 'visibility', 'none');
        map.addLayer({ id: 'seen-states', type: 'fill', source: 'seen1', paint: { 'fill-color': colour, 'fill-opacity': 0.3 } }, 'pins');
        map.addLayer({ id: 'seen-districts', type: 'fill', source: 'seen2', paint: { 'fill-color': colour, 'fill-opacity': 0.95 } }, 'pins');
        map.addLayer({ id: 'districts', type: 'line', source: 'adm2', paint: { 'line-color': cssVar('--map-border'), 'line-width': 0.4, 'line-opacity': 0.6 } }, 'pins');
        map.addLayer({ id: 'states', type: 'line', source: 'adm1', paint: { 'line-color': cssVar('--map-border'), 'line-width': 1.2 } }, 'pins');
      };
      if (map.loaded()) add(); else map.once('load', add);
    });
    mapRef.current = map;
    return () => { closed = true; map.remove(); };
  }, [shape, pins, mine, colour, code]);

  const cities = new Set(mine.filter(v => v.exitedAirport).map(v => v.geonameId)).size;

  return (
    <motion.div className="sheet country" {...drag.sheet} role="dialog" aria-modal="true" aria-label={country?.name}
      initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.25 }}>
      {drag.handle}
      <div className="sheet-head">
        <h1 className="title small">{country?.name}</h1>
        <button className="text-button" onClick={onClose}>Done</button>
      </div>
      <p className="result-where">{country?.continent} · {cities} {cities === 1 ? 'city' : 'cities'}</p>
      <div ref={el} className="country-map" />
      {mine.length === 0 ? (
        <p className="hint">You haven't logged a place here yet. Tap + on the globe to add one.</p>
      ) : (
        <ul className="results">
          {mine.map(v => (
            <li key={v.id}>
              {/* Tap a visit to zoom to its district: city-sized districts are a few pixels at country zoom. */}
              <button className="result" onClick={() => {
                const d = districtRef.current[v.id];
                mapRef.current?.fitBounds(d ? bboxOf(d) : [[v.lon - 0.3, v.lat - 0.3], [v.lon + 0.3, v.lat + 0.3]], { padding: 40, duration: 900 });
              }}>
                <span className="result-name">{v.name}</span>
                {areas[v.id] && <span className="result-where">{areas[v.id]}</span>}
                <span className="result-where">{describeDates(v)}{v.note ? ` · ${v.note}` : ''}</span>
              </button>
              <button className="text-button" onClick={() => onEdit(v)} aria-label={`Edit ${v.name}`}>Edit</button>
            </li>
          ))}
        </ul>
      )}
    </motion.div>
  );
}
