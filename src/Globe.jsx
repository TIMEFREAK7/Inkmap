import { useEffect, useRef } from 'react';
import { setWorkerUrl } from 'maplibre-gl';
import { newMap } from './map.js';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { nightAlpha, sunLight, cityLights, sunScreenDirection, MERCATOR_LAT } from './sun.js';
import { loadLights } from './data.js';
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

// Night as one picture over the whole world (see sun.js), drawn on a small canvas the map reads directly
// (a canvas source: no image encoding, which stalled the phone for over a second every minute).
// shortcut: 128 px is soft enough for a gradient; if the line looks blurry zoomed in, draw a bigger one only then.
const NIGHT_CORNERS = [[-180, MERCATOR_LAT], [180, MERCATOR_LAT], [180, -MERCATOR_LAT], [-180, -MERCATOR_LAT]];
const NIGHT_SIZE = 128;
function drawNight(canvas, date) {
  const ctx = canvas.getContext('2d'), img = ctx.createImageData(NIGHT_SIZE, NIGHT_SIZE);
  const alpha = nightAlpha(date, NIGHT_SIZE, NIGHT_SIZE);
  for (let i = 0; i < alpha.length; i++) { img.data[i * 4 + 2] = 10; img.data[i * 4 + 3] = alpha[i]; } // near-black, a hint of blue
  ctx.putImageData(img, 0, 0);
}

const EMPTY = { type: 'FeatureCollection', features: [] };

// The sun, drawn in space beside the globe on the side it lights (so it's never mistaken for a place on the map).
// Only when zoomed out far enough for it to fit on screen next to the planet; it fades as it swings behind the
// globe or behind the viewer.
function placeSun(map, el, date) {
  if (!el) return;
  const { width, height } = map.getContainer().getBoundingClientRect();
  const c = map.getCenter(), mid = map.project(c);
  const radius = (512 * 2 ** map.getZoom()) / (2 * Math.PI) / Math.cos((Math.min(Math.abs(c.lat), 85) * Math.PI) / 180);
  const dir = sunScreenDirection(date, c, map.getBearing());
  const side = Math.hypot(dir.x, dir.y);
  const dist = radius * 1.35 + 30;
  const x = mid.x + (dir.x / side) * dist, y = mid.y + (dir.y / side) * dist;
  const onScreen = x > 30 && x < width - 30 && y > 120 && y < height - 140; // clear of the counters and tab bar
  const facing = Math.min(1, Math.max(0, (side - 0.35) / 0.3)); // fades out when the sun is straight behind or in front
  el.style.opacity = onScreen ? facing : 0;
  el.style.transform = `translate(${x}px, ${y}px)`;
}

// The whole globe facing `center`, cropped square from the map's own canvas, for the postcard.
// The person's view is put back afterwards. Captured inside the render event: the canvas is cleared after each frame.
async function snapshot(map, center) {
  const before = { center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() };
  const { width, height } = map.getContainer().getBoundingClientRect();
  const radius = Math.min(width, height) * 0.42; // CSS px, leaving room for the glow at the rim
  map.jumpTo({ center, zoom: Math.log2((radius * 2 * Math.PI * Math.cos((center[1] * Math.PI) / 180)) / 512), bearing: 0, pitch: 0 });
  await Promise.race([map.once('idle'), new Promise(ok => setTimeout(ok, 3000))]);
  const gl = map.getCanvas(), ratio = gl.width / width, side = Math.round(radius * 2.2 * ratio);
  const out = Object.assign(document.createElement('canvas'), { width: side, height: side });
  await new Promise(ok => {
    map.once('render', () => { out.getContext('2d').drawImage(gl, (gl.width - side) / 2, (gl.height - side) / 2, side, side, 0, 0, side, side); ok(); });
    map.triggerRepaint();
  });
  map.jumpTo(before);
  return out;
}

// Theme colours for the globe (sky, sea, lines); re-applied when the app colour changes.
const sky = () => ({
  'sky-color': 'rgba(0, 0, 0, 0)', 'horizon-color': 'rgba(0, 0, 0, 0)', 'fog-color': cssVar('--map-ocean'),
  'sky-horizon-blend': 0, 'horizon-fog-blend': 0.7, 'fog-ground-blend': 0.85, 'atmosphere-blend': 0.4,
});
const themePaint = map => {
  map.setSky(sky());
  map.setPaintProperty('ocean', 'background-color', cssVar('--map-ocean'));
  map.setPaintProperty('border', 'line-color', cssVar('--map-border'));
};

// No tile server: the only sources are the bundled country shapes and what's computed here.
function style(geo, visited, colour, nightCanvas) {
  return {
    version: 8,
    projection: { type: 'globe' },
    sky: sky(),
    // The atmosphere's glow is lit by this light: aimed at the real sun, the bright rim marks the day side.
    light: { anchor: 'map', position: sunLight(new Date()) },
    sources: {
      countries: { type: 'geojson', data: geo },
      night: { type: 'canvas', canvas: nightCanvas, coordinates: NIGHT_CORNERS, animate: false },
      lights: { type: 'geojson', data: EMPTY },
      graticule: { type: 'geojson', data: GRATICULE },
    },
    layers: [
      { id: 'ocean', type: 'background', paint: { 'background-color': cssVar('--map-ocean') } },
      { id: 'graticule', type: 'line', source: 'graticule', paint: { 'line-color': '#ffffff', 'line-opacity': 0.07, 'line-width': 0.8 } },
      { id: 'fill', type: 'fill', source: 'countries', paint: { 'fill-color': fillColour(visited, colour), 'fill-opacity': 0.95 } },
      { id: 'border', type: 'line', source: 'countries', paint: { 'line-color': cssVar('--map-border'), 'line-width': 0.6 } },
      // Night, from the real time of day: dark where the sun is 18° below the horizon, fading softly through twilight.
      { id: 'night', type: 'raster', source: 'night', paint: { 'raster-resampling': 'linear', 'raster-fade-duration': 0 } },
      // City lights on the night side: a warm glow and a bright core, bigger for bigger cities, on as it gets dark.
      { id: 'lights-glow', type: 'circle', source: 'lights', paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 0, ['*', ['get', 'size'], 0.9], 1.6, ['*', ['get', 'size'], 2.2], 4, ['*', ['get', 'size'], 5]],
        'circle-color': '#ffb347', 'circle-blur': 1, 'circle-opacity': ['*', ['get', 'dark'], 0.4] } },
      { id: 'lights', type: 'circle', source: 'lights', paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 0, ['*', ['get', 'size'], 0.35], 1.6, ['*', ['get', 'size'], 0.7], 4, ['*', ['get', 'size'], 1.4]],
        'circle-color': '#ffe7b3', 'circle-opacity': ['*', ['get', 'dark'], 0.95] } },
      // Above the night: visited countries glow at their edges like city lights, so they stand out on the dark side too.
      { id: 'glow', type: 'line', source: 'countries', filter: visitedFilter(visited),
        paint: { 'line-color': colour, 'line-width': 2.5, 'line-blur': 2.5, 'line-opacity': 0.95 } },
    ],
  };
}

// focus: { lon, lat } of a place just logged; the camera flies there and the new fill lands with it.
export default function Globe({ geo, visited, colour, focus, paused, onCountry, start, onLeave, theme, snapRef }) {
  const el = useRef(null);
  const sunEl = useRef(null);
  const mapRef = useRef(null);
  const touchRef = useRef(null);
  const spinRef = useRef(null);
  const pausedRef = useRef(paused);
  const onCountryRef = useRef(onCountry);
  onCountryRef.current = onCountry;
  const onLeaveRef = useRef(onLeave);
  onLeaveRef.current = onLeave;

  useEffect(() => {
    const nightCanvas = Object.assign(document.createElement('canvas'), { width: NIGHT_SIZE, height: NIGHT_SIZE });
    drawNight(nightCanvas, new Date());
    const map = newMap({
      // Launch: start turned a quarter away from where the person last looked, then turn to face it.
      container: el.current, style: style(geo, visited, colour, nightCanvas), center: [(start?.[0] ?? 78) + 90, start?.[1] ?? 20], zoom: 1.6,
      attributionControl: false, renderWorldCopies: false,
      // Phones report 3-4x; past 2x the extra pixels cost GPU time without a visible difference on the globe.
      pixelRatio: Math.min(devicePixelRatio, 2),
      // Smooth edges: without it, slow rotation makes coastlines and borders hop a whole pixel at a time.
      canvasContextAttributes: { antialias: true },
      // Lighter flick than MapLibre's default (stops within ~0.5 s): faster release speed, longer glide.
      dragPan: { maxSpeed: 4000, deceleration: 1200 },
    });
    if (!map) { el.current.classList.add('ready'); return; }

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
    if (snapRef) snapRef.current = async center => {
      stopSpin();
      try { return await snapshot(map, center); } finally { startSpin(); } // startSpin does nothing while paused
    };
    // A tap (not a drag) on a country opens it.
    map.on('click', 'fill', e => onCountryRef.current?.(e.features[0].properties.iso));
    map.on('mousedown', touch);
    map.on('touchstart', touch);
    map.on('wheel', touch);
    map.on('load', () => {
      el.current?.classList.add('ready'); // fade in from black
      map.easeTo({ center: start ?? [78, 20], duration: reduced ? 0 : 1600, easing: t => 1 - (1 - t) ** 3 });
      startSpin();
    });
    // Remember where the globe faced, for the next launch.
    const leave = () => { if (document.hidden) { const c = map.getCenter(); onLeaveRef.current?.([c.lng, c.lat]); } };
    document.addEventListener('visibilitychange', leave);
    let lights = [];
    loadLights().then(l => { lights = l; map.getSource('lights')?.setData(cityLights(new Date(), lights)); }, () => {});
    map.on('load', () => map.getSource('lights')?.setData(cityLights(new Date(), lights)));
    const sunMoves = () => placeSun(map, sunEl.current, new Date());
    map.on('move', sunMoves);
    map.on('resize', sunMoves);
    map.once('load', sunMoves);
    const night = setInterval(() => { // the line moves 0.25° a minute
      const now = new Date();
      drawNight(nightCanvas, now);
      const source = map.getSource('night');
      source?.play(); // upload the redrawn canvas on the next frame, then stop watching it
      requestAnimationFrame(() => requestAnimationFrame(() => source?.pause()));
      map.getSource('lights')?.setData(cityLights(now, lights));
      map.setLight({ anchor: 'map', position: sunLight(now) });
      sunMoves();
    }, 60000);
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
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    map.flyTo({ center: [focus.lon, focus.lat], zoom: 2.4, duration: still ? 0 : 1200 });
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

  return (
    <div className="globe-wrap">
      <div ref={el} className="globe" />
      <div ref={sunEl} className="sun-orb" aria-hidden="true" />
    </div>
  );
}
