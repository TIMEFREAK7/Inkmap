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
const STEP = 2; // degrees per cell
const LEVELS = 12;

// Night as bands of 2° cells, each with a darkness from 0 (sunset) to 1 (full night), so the line fades through
// twilight instead of a hard edge. Neighbouring cells of the same darkness are merged: about a thousand features.
export function nightShade(date) {
  const sun = subsolar(date);
  const features = [];
  for (let lat = -88; lat < 88; lat += STEP) {
    let runStart = null, runLevel = 0;
    const flush = end => {
      if (runStart !== null && runLevel > 0) {
        features.push({ type: 'Feature', properties: { shade: runLevel / LEVELS },
          geometry: { type: 'Polygon', coordinates: [[[runStart, lat], [end, lat], [end, lat + STEP], [runStart, lat + STEP], [runStart, lat]]] } });
      }
    };
    for (let lon = -180; lon <= 180; lon += STEP) {
      const alt = lon < 180 ? sunAltitude(sun, lat + STEP / 2, lon + STEP / 2) : 90;
      const level = Math.round(Math.min(1, Math.max(0, -alt / TWILIGHT + 0.08)) * LEVELS);
      if (level !== runLevel || lon === 180) { flush(lon); runStart = lon; runLevel = level; }
    }
  }
  return { type: 'FeatureCollection', features };
}
