// Where it's night right now, for the shaded half of the globe. Accurate to about a degree, plenty for a picture.
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

// The night side as one GeoJSON polygon: the day/night line from -180° to 180°, closed along the pole in darkness.
// (Kept within ±85°, where the globe's map ends.)
export function nightPolygon(date) {
  const sun = subsolar(date);
  const decl = Math.abs(sun.lat) < 0.01 ? 0.01 : sun.lat; // at the equinox the line runs pole to pole
  const ring = [];
  for (let lon = -180; lon <= 180; lon += 2) {
    const lat = Math.atan(-Math.cos((lon - sun.lon) * RAD) / Math.tan(decl * RAD)) / RAD;
    ring.push([lon, Math.max(-85, Math.min(85, lat))]);
  }
  const pole = decl > 0 ? -85 : 85; // northern summer: the south pole is in darkness
  ring.push([180, pole], [-180, pole], ring[0]);
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } };
}
