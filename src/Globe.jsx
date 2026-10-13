import { useEffect, useRef } from 'react';
import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';

// MapLibre only finds its own worker over http(s); Electron loads from file://, so point it at the bundled copy.
setWorkerUrl(workerUrl);

const LAND = '#3b4a63'; // unvisited: muted slate

const DEG_PER_MS = 360 / 40000; // one turn every 40 s (2 min read as sluggish on the phone)
const SPIN_STEP_MS = 10000;
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
export default function Globe({ geo, visited, colour, focus }) {
  const el = useRef(null);
  const mapRef = useRef(null);
  const touchRef = useRef(null);

  useEffect(() => {
    const map = new MapLibreMap({
      container: el.current, style: style(geo, visited, colour), center: [78, 20], zoom: 1.6,
      attributionControl: false, renderWorldCopies: false,
      // Phones report 3-4x; past 2x the extra pixels cost GPU time without a visible difference on the globe.
      pixelRatio: Math.min(devicePixelRatio, 2),
      // Smooth edges: without it, slow rotation makes coastlines and borders hop a whole pixel at a time.
      canvasContextAttributes: { antialias: true },
      // Lighter flick than MapLibre's default (stops within ~0.5 s): faster release speed, longer glide.
      dragPan: { maxSpeed: 4000, deceleration: 1200 },
    });

    // Spin with MapLibre's own animation so each camera step lands on a frame it renders.
    // Chained linear eases; a touch cancels the ease, and moveend restarts it after RESUME_AFTER_MS idle.
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let touchedAt = -Infinity, timer;
    const spin = () => {
      const c = map.getCenter();
      map.easeTo({ center: [c.lng - SPIN_STEP_MS * DEG_PER_MS, c.lat], duration: SPIN_STEP_MS, easing: t => t });
    };
    const scheduleSpin = () => {
      clearTimeout(timer);
      if (reduced) return;
      const wait = touchedAt + RESUME_AFTER_MS - performance.now();
      if (wait > 0) timer = setTimeout(spin, wait);
      else spin(); // chain straight on, so there's no paused frame between eases
    };
    const touch = () => { touchedAt = performance.now(); };
    mapRef.current = map;
    touchRef.current = touch;
    map.on('mousedown', touch);
    map.on('touchstart', touch);
    map.on('wheel', touch);
    map.on('moveend', scheduleSpin);
    map.on('load', scheduleSpin);
    return () => { clearTimeout(timer); map.remove(); };
    // The map is built once; visited/colour/focus changes are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo]);

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
