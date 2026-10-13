import { useEffect, useRef } from 'react';
import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';

// MapLibre only finds its own worker over http(s); Electron loads from file://, so point it at the bundled copy.
setWorkerUrl(workerUrl);

export const CONTINENT_COLOURS = {
  'Africa': '#f59e0b', 'Asia': '#ef4444', 'Europe': '#3b82f6', 'North America': '#10b981',
  'South America': '#a855f7', 'Oceania': '#06b6d4', 'Antarctica': '#e2e8f0',
};

const DEG_PER_MS = 360 / 120000; // one turn every 2 minutes
const RESUME_AFTER_MS = 5000;

// No tile server: the only source is the bundled country GeoJSON.
function style(geo) {
  return {
    version: 8,
    projection: { type: 'globe' },
    sky: { 'atmosphere-blend': 0.6 },
    sources: { countries: { type: 'geojson', data: geo } },
    layers: [
      { id: 'space', type: 'background', paint: { 'background-color': '#0b1026' } },
      {
        id: 'fill', type: 'fill', source: 'countries',
        paint: {
          'fill-color': ['match', ['get', 'continent'], ...Object.entries(CONTINENT_COLOURS).flat(), '#3b4a63'],
          'fill-opacity': 0.85,
        },
      },
      { id: 'border', type: 'line', source: 'countries', paint: { 'line-color': '#0b1026', 'line-width': 0.5 } },
    ],
  };
}

export default function Globe({ geo }) {
  const el = useRef(null);

  useEffect(() => {
    const map = new MapLibreMap({
      container: el.current, style: style(geo), center: [78, 20], zoom: 1.6,
      attributionControl: false, renderWorldCopies: false,
    });

    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let last = performance.now(), touchedAt = -Infinity, raf;
    const spin = now => {
      const dt = now - last;
      last = now;
      if (!reduced && now - touchedAt > RESUME_AFTER_MS && !map.isMoving()) {
        const c = map.getCenter();
        map.setCenter([c.lng - dt * DEG_PER_MS, c.lat]);
      }
      raf = requestAnimationFrame(spin);
    };
    const touch = () => { touchedAt = performance.now(); };
    map.on('mousedown', touch);
    map.on('touchstart', touch);
    map.on('wheel', touch);
    map.on('load', () => { raf = requestAnimationFrame(spin); });
    return () => { cancelAnimationFrame(raf); map.remove(); };
  }, [geo]);

  return <div ref={el} className="globe" />;
}
