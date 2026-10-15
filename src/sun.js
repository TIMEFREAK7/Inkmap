// Where it's night right now, for the shading on the globe. Accurate to about a degree, plenty for a picture.
const RAD = Math.PI / 180;

// The point on Earth where the sun is straight overhead: { lat, lon } in degrees.
export function subsolar(date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const n = (date - start) / 86400000; // day of year, fractional
  const decl = -23.44 * Math.cos((2 * Math.PI / 365) * (n + 10));
  const b = (2 * Math.PI * (n - 81)) / 364;
  const eot = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b); // equation of time, minutes
  const hours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  let lon = -15 * (hours - 12 + eot / 60);
  lon = ((lon + 540) % 360) - 180;
  return { lat: decl, lon };
}

// The sun's height above the horizon at a place, in degrees (negative: below it).
export function sunAltitude(sun, lat, lon) {
  return Math.asin(Math.sin(lat * RAD) * Math.sin(sun.lat * RAD) + Math.cos(lat * RAD) * Math.cos(sun.lat * RAD) * Math.cos((lon - sun.lon) * RAD)) / RAD;
}

const TWILIGHT = 18; // astronomical twilight: fully dark when the sun is 18° below the horizon
export const MERCATOR_LAT = 85.0511; // the square world image covers Web Mercator's full latitude range

// Night as an image: per pixel, how dark (0-255), for a w×h Web Mercator picture of the whole world.
// The globe stretches it over the planet with smooth filtering, so the line fades softly through twilight.
// Works on the sine of the sun's height (no per-pixel trig): one multiply-add per pixel, a few ms per redraw.
export function nightAlpha(date, w = 128, h = 128, max = 0.62) {
  const sun = subsolar(date);
  const sinD = Math.sin(sun.lat * RAD), cosD = Math.cos(sun.lat * RAD);
  const cosH = new Float64Array(w);
  for (let x = 0; x < w; x++) cosH[x] = Math.cos((-180 + (360 * (x + 0.5)) / w - sun.lon) * RAD);
  const lo = Math.sin(2 * RAD), span = lo + Math.sin(TWILIGHT * RAD); // dark from 2° above to 18° below the horizon
  const alpha = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    const lat = Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 0.5)) / h)));
    const a = Math.sin(lat) * sinD, b = Math.cos(lat) * cosD;
    for (let x = 0; x < w; x++) {
      const t = (lo - (a + b * cosH[x])) / span; // 0 at the start of dusk, 1 at full night
      const dark = t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t); // smoothstep: no visible band edges
      alpha[y * w + x] = dark * max * 255;
    }
  }
  return alpha;
}

// MapLibre light position ([radius, azimuth°, polar°], anchor 'map') that lights the globe's atmosphere from the
// real sun: the bright rim then sits on the day side and the night side's edge stays dark.
// MapLibre turns the light into a direction with x east, y north, z out of the globe at 0°N 0°E and points it
// the opposite way; so the light sits at minus the direction to the subsolar point.
export function sunLight(date) {
  const s = subsolar(date);
  const [la, lo] = [s.lat * RAD, s.lon * RAD];
  const v = [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)]; // toward the sun
  const polar = Math.acos(-v[2]) / RAD;
  const azimuth = Math.atan2(-v[1], -v[0]) / RAD - 90;
  return [1.5, azimuth, polar];
}

// City lights: the cities from data/lights.json ([lon, lat, size]) that are in darkness now, each with how dark
// it is there (0-1), so lights come on through dusk and are brightest in full night.
export function cityLights(date, lights) {
  const sun = subsolar(date);
  const features = [];
  for (const [lon, lat, size] of lights) {
    const dark = Math.min(1, Math.max(0, -sunAltitude(sun, lat, lon) / 10)); // lights fully on 10° after sunset
    if (dark > 0.05) features.push({ type: 'Feature', properties: { dark, size }, geometry: { type: 'Point', coordinates: [lon, lat] } });
  }
  return { type: 'FeatureCollection', features };
}

// Where the sun is, seen from the camera: { x, y } on screen (unit vector, y down) and `front` (true when the sun is
// behind the viewer). center: the map's centre { lng, lat }; bearing in degrees.
export function sunScreenDirection(date, center, bearing = 0) {
  const s = subsolar(date);
  const [la, d, c] = [s.lat * RAD, (s.lon - center.lng) * RAD, center.lat * RAD];
  const x = Math.cos(la) * Math.sin(d), y = Math.sin(la), z = Math.cos(la) * Math.cos(d);
  const y2 = y * Math.cos(c) - z * Math.sin(c), z2 = y * Math.sin(c) + z * Math.cos(c);
  const b = bearing * RAD;
  return { x: x * Math.cos(b) + y2 * Math.sin(b), y: -(-x * Math.sin(b) + y2 * Math.cos(b)), front: z2 > 0 };
}
