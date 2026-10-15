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
// The globe stretches it over the planet with smooth filtering, so the line fades softly through twilight,
// and redrawing it once a minute costs one texture upload instead of re-tiling thousands of shapes.
export function nightAlpha(date, w = 256, h = 256, max = 0.62) {
  const sun = subsolar(date);
  const alpha = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    const lat = Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 0.5)) / h))) / RAD;
    for (let x = 0; x < w; x++) {
      const lon = -180 + (360 * (x + 0.5)) / w;
      const dark = Math.min(1, Math.max(0, (2 - sunAltitude(sun, lat, lon)) / (TWILIGHT + 2))); // starts just before sunset
      alpha[y * w + x] = Math.round(dark * dark * (3 - 2 * dark) * max * 255); // smoothstep: no visible band edges
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
