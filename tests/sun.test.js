import { describe, expect, it } from 'vitest';
import { subsolar, sunAltitude, nightAlpha, sunLight } from '../src/sun.js';

// Darkness (0-1) at a place, read from the 360×360 Mercator image.
const darkAt = (img, lon, lat, n = 360) => {
  const x = Math.floor(((lon + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2) * n);
  return img[y * n + x] / (0.62 * 255);
};

describe('day and night', () => {
  it('puts the sun over the tropic of Cancer in June and near the equator in March', () => {
    expect(subsolar(new Date('2025-06-21T12:00:00Z')).lat).toBeCloseTo(23.4, 0);
    expect(Math.abs(subsolar(new Date('2025-03-20T12:00:00Z')).lat)).toBeLessThan(1.5); // simple formula: within ~1°
  });
  it('puts the sun over Greenwich at noon UTC (within the equation of time)', () => {
    expect(Math.abs(subsolar(new Date('2025-06-21T12:00:00Z')).lon)).toBeLessThan(3);
  });
  it('knows the sun is high at noon and low at midnight', () => {
    const sun = subsolar(new Date('2025-06-21T12:00:00Z'));
    expect(sunAltitude(sun, 23.4, 0)).toBeGreaterThan(85);
    expect(sunAltitude(sun, 0, 179)).toBeLessThan(-60);
  });
  it('shades night fully, twilight partly and day not at all', () => {
    const img = nightAlpha(new Date('2025-06-21T12:00:00Z'), 360, 360);
    expect(darkAt(img, 1, 11)).toBe(0); // noon near Greenwich
    expect(darkAt(img, 175, 1)).toBeCloseTo(1, 1); // Pacific at midnight
    expect(darkAt(img, 1, -84)).toBeCloseTo(1, 1); // far south in June: dark even at noon
    const dusk = darkAt(img, 95, 1); // a few degrees past sunset
    expect(dusk).toBeGreaterThan(0.05);
    expect(dusk).toBeLessThan(0.95);
  });
  it('aims the globe light away from the subsolar point (MapLibre flips it toward the sun)', () => {
    const date = new Date('2025-06-21T09:00:00Z'), s = subsolar(date), [, az, polar] = sunLight(date);
    const r = Math.PI / 180, a = (az + 90) * r, p = polar * r;
    const light = [Math.sin(p) * Math.cos(a), Math.sin(p) * Math.sin(a), Math.cos(p)]; // MapLibre's sphericalToCartesian
    const sun = [Math.cos(s.lat * r) * Math.sin(s.lon * r), Math.sin(s.lat * r), Math.cos(s.lat * r) * Math.cos(s.lon * r)];
    light.forEach((c, i) => expect(c).toBeCloseTo(-sun[i], 6));
  });
});
