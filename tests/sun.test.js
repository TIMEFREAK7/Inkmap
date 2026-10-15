import { describe, expect, it } from 'vitest';
import { subsolar, sunAltitude, nightShade } from '../src/sun.js';

const shadeAt = (fc, lon, lat) => fc.features.find(f => {
  const [[a, b], [c], [, , [, d]]] = [f.geometry.coordinates[0][0], f.geometry.coordinates[0][1], f.geometry.coordinates[0]];
  return lon >= a && lon < c && lat >= b && lat < d;
})?.properties.shade ?? 0;

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
    const fc = nightShade(new Date('2025-06-21T12:00:00Z'));
    expect(shadeAt(fc, 1, 11)).toBe(0); // noon near Greenwich
    expect(shadeAt(fc, 175, 1)).toBe(1); // Pacific at midnight
    expect(shadeAt(fc, 1, -87)).toBe(1); // near the South Pole in June: dark even at noon (at 79°S it's only twilight)
    expect(shadeAt(fc, 175, 79)).toBeLessThan(1); // Arctic summer midnight: twilight at most
    const dusk = shadeAt(fc, 95, 1); // ~6° past the terminator
    expect(dusk).toBeGreaterThan(0);
    expect(dusk).toBeLessThan(1);
    expect(fc.features.length).toBeLessThan(3000);
  });
});
