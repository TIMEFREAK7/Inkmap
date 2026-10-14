import { useEffect, useRef } from 'react';
import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';

// MapLibre only finds its own worker over http(s); Electron loads from file://, so point it at the bundled copy.
setWorkerUrl(workerUrl);

const LAND = '#3b4a63'; // unvisited: muted slate

const DEG_PER_MS = 360 / 40000; // one turn every 40 s (2 min read as sluggish on the phone)
const RESUME_AFTER_MS = 5000;

// Visited countries in the person's colour, everything else muted slate.
const fillColour = (visited, colour) => ['case', ['in', ['get', 'iso'], ['literal', visited]], colour, LAND];

// No tile server: the only source is the bundled country GeoJSON.
function style(geo, visited, colour) {
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
          'fill-color': fillColour(visited, colour),
          'fill-opacity': 0.9,
        },
      },
      { id: 'border', type: 'line', source: 'countries', paint: { 'line-color': '#0b1026', 'line-width': 0.5 } },
    ],
  };
}

// focus: { lon, lat } of a place just logged; the camera flies there and the new fill lands with it.
export default function Globe({ geo, visited, colour, focus, paused, onCountry, start, onLeave }) {
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
    return () => { document.removeEventListener('visibilitychange', leave); stopSpin(); map.remove(); };
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
    const paint = () => map.setPaintProperty('fill', 'fill-color', fillColour(visited, colour));
    // Fill after the camera lands, so the person sees the country change colour.
    if (!map.isStyleLoaded()) map.once('load', paint);
    else if (map.isMoving()) map.once('moveend', paint);
    else paint();
  }, [visited, colour]);

  return <div ref={el} className="globe" />;
}
