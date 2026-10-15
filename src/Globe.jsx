import { useEffect, useRef } from 'react';
import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { nightShade } from './sun.js';
import { cssVar } from './theme.js';

// MapLibre only finds its own worker over http(s); Electron loads from file://, so point it at the bundled copy.
setWorkerUrl(workerUrl);

const DEG_PER_MS = 360 / 40000; // one turn every 40 s (2 min read as sluggish on the phone)
const RESUME_AFTER_MS = 5000;

// Visited countries in the person's colour, everything else the theme's land colour.
const visitedFilter = visited => ['in', ['get', 'iso'], ['literal', visited]];
const fillColour = (visited, colour) => ['case', visitedFilter(visited), colour, cssVar('--map-land')];

// Faint latitude and longitude lines every 30°, so the globe reads as a sphere even over open ocean.
const GRATICULE = {
  type: 'FeatureCollection',
  features: [
    ...Array.from({ length: 12 }, (_, i) => -180 + i * 30).map(lon => ({
      type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: Array.from({ length: 35 }, (_, j) => [lon, -85 + j * 5]) },
    })),
    ...[-60, -30, 0, 30, 60].map(lat => ({
      type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: Array.from({ length: 73 }, (_, j) => [-180 + j * 5, lat]) },
    })),
  ],
};

// Theme colours for the globe (sky, sea, lines); re-applied when the app colour changes.
const sky = () => ({
  'sky-color': 'rgba(0, 0, 0, 0)', 'horizon-color': cssVar('--primary'), 'fog-color': cssVar('--map-ocean'),
  'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.7, 'fog-ground-blend': 0.85, 'atmosphere-blend': 0.85,
});
const themePaint = map => {
  map.setSky(sky());
  map.setPaintProperty('ocean', 'background-color', cssVar('--map-ocean'));
  map.setPaintProperty('border', 'line-color', cssVar('--map-border'));
};

// No tile server: the only sources are the bundled country shapes and what's computed here.
function style(geo, visited, colour) {
  return {
    version: 8,
    projection: { type: 'globe' },
    sky: sky(),
    sources: {
      countries: { type: 'geojson', data: geo },
      night: { type: 'geojson', data: nightShade(new Date()) },
      graticule: { type: 'geojson', data: GRATICULE },
    },
    layers: [
      { id: 'ocean', type: 'background', paint: { 'background-color': cssVar('--map-ocean') } },
      { id: 'graticule', type: 'line', source: 'graticule', paint: { 'line-color': '#ffffff', 'line-opacity': 0.07, 'line-width': 0.8 } },
      { id: 'fill', type: 'fill', source: 'countries', paint: { 'fill-color': fillColour(visited, colour), 'fill-opacity': 0.95 } },
      { id: 'border', type: 'line', source: 'countries', paint: { 'line-color': cssVar('--map-border'), 'line-width': 0.6 } },
      // Night, from the real time of day: full dark where the sun is 18° below the horizon, fading through twilight.
      { id: 'night', type: 'fill', source: 'night',
        paint: { 'fill-color': '#000308', 'fill-opacity': ['*', ['get', 'shade'], 0.6], 'fill-antialias': false } },
      // Above the night: visited countries glow at their edges like city lights, so they stand out on the dark side too.
      { id: 'glow', type: 'line', source: 'countries', filter: visitedFilter(visited),
        paint: { 'line-color': colour, 'line-width': 2.5, 'line-blur': 2.5, 'line-opacity': 0.95 } },
    ],
  };
}

// focus: { lon, lat } of a place just logged; the camera flies there and the new fill lands with it.
export default function Globe({ geo, visited, colour, focus, paused, onCountry, start, onLeave, theme }) {
  const el = useRef(null);
  const mapRef = useRef(null);
  const touchRef = useRef(null);
  const spinRef = useRef(null);
  const pausedRef = useRef(paused);
  const onCountryRef = useRef(onCountry);
  onCountryRef.current = onCountry;
  const onLeaveRef = useRef(onLeave);
  onLeaveRef.current = onLeave;

  useEffect(() => {
    const map = new MapLibreMap({
      // Launch: start turned a quarter away from where the person last looked, then turn to face it.
      container: el.current, style: style(geo, visited, colour), center: [(start?.[0] ?? 78) + 90, start?.[1] ?? 20], zoom: 1.6,
      attributionControl: false, renderWorldCopies: false,
      // Phones report 3-4x; past 2x the extra pixels cost GPU time without a visible difference on the globe.
      pixelRatio: Math.min(devicePixelRatio, 2),
      // Smooth edges: without it, slow rotation makes coastlines and borders hop a whole pixel at a time.
      canvasContextAttributes: { antialias: true },
      // Lighter flick than MapLibre's default (stops within ~0.5 s): faster release speed, longer glide.
      dragPan: { maxSpeed: 4000, deceleration: 1200 },
    });

    // Idle spin: move the camera a little each frame. Not via chained easeTo: starting an ease from inside the
    // moveend of the one ending left MapLibre running an orphaned frame callback ("_onEaseFrame is not a function").
    // Skipped while the person or a camera flight is moving the map, and for RESUME_AFTER_MS after a touch.
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let touchedAt = -Infinity, raf = 0, last = 0;
    const frame = now => {
      const dt = Math.min(now - last, 50); // after a stall, carry on rather than jump
      last = now;
      if (now - touchedAt > RESUME_AFTER_MS && !map.isMoving()) {
        const c = map.getCenter();
        map.jumpTo({ center: [c.lng - dt * DEG_PER_MS, c.lat] });
      }
      raf = requestAnimationFrame(frame);
    };
    const startSpin = () => {
      if (raf || reduced || pausedRef.current) return; // nothing to see while another screen covers the globe
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    const stopSpin = () => { cancelAnimationFrame(raf); raf = 0; };
    const touch = () => { touchedAt = performance.now(); };
    mapRef.current = map;
    touchRef.current = touch;
    spinRef.current = { startSpin, stopSpin };
    // A tap (not a drag) on a country opens it.
    map.on('click', 'fill', e => onCountryRef.current?.(e.features[0].properties.iso));
    map.on('mousedown', touch);
    map.on('touchstart', touch);
    map.on('wheel', touch);
    map.on('load', () => {
      el.current?.classList.add('ready'); // fade in from black
      map.easeTo({ center: start ?? [78, 20], duration: 1600, easing: t => 1 - (1 - t) ** 3 });
      startSpin();
    });
    // Remember where the globe faced, for the next launch.
    const leave = () => { if (document.hidden) { const c = map.getCenter(); onLeaveRef.current?.([c.lng, c.lat]); } };
    document.addEventListener('visibilitychange', leave);
    const night = setInterval(() => map.getSource('night')?.setData(nightShade(new Date())), 60000); // moves 0.25° a minute
    return () => { clearInterval(night); document.removeEventListener('visibilitychange', leave); stopSpin(); map.remove(); };
    // The map is built once; visited/colour/focus changes are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo]);

  useEffect(() => {
    pausedRef.current = paused;
    if (!mapRef.current) return;
    if (paused) spinRef.current.stopSpin();
    else spinRef.current.startSpin();
  }, [paused]);

  useEffect(() => {
    const map = mapRef.current;
    if (!focus || !map) return;
    touchRef.current(); // rest for a few seconds on the new place before spinning again
    map.flyTo({ center: [focus.lon, focus.lat], zoom: 2.4, duration: 1200 });
  }, [focus]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const paint = () => {
      map.setPaintProperty('fill', 'fill-color', fillColour(visited, colour));
      map.setFilter('glow', visitedFilter(visited));
      map.setPaintProperty('glow', 'line-color', colour);
    };
    // Fill after the camera lands, so the person sees the country change colour.
    if (!map.isStyleLoaded()) map.once('load', paint);
    else if (map.isMoving()) map.once('moveend', paint);
    else paint();
  }, [visited, colour]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => { themePaint(map); map.setPaintProperty('fill', 'fill-color', fillColour(visited, colour)); };
    if (map.isStyleLoaded()) apply(); else map.once('load', apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  return <div ref={el} className="globe" />;
}
