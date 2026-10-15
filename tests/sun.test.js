import { describe, expect, it } from 'vitest';
import { subsolar, nightPolygon } from '../src/sun.js';
import { pointInFeature } from '../src/geo.js';

describe('day and night', () => {
  it('puts the sun over the tropic of Cancer in June and the equator in March', () => {
    expect(subsolar(new Date('2025-06-21T12:00:00Z')).lat).toBeCloseTo(23.4, 0);
    expect(Math.abs(subsolar(new Date('2025-03-20T12:00:00Z')).lat)).toBeLessThan(1.5); // simple formula: within ~1°
  });
  it('puts the sun over Greenwich at noon UTC (within the equation of time)', () => {
    expect(Math.abs(subsolar(new Date('2025-06-21T12:00:00Z')).lon)).toBeLessThan(3);
  });
  it('shades the far side of the world', () => {
    const night = nightPolygon(new Date('2025-06-21T12:00:00Z'));
    expect(pointInFeature(0, 10, night)).toBe(false); // London-ish longitude at noon: day
    expect(pointInFeature(175, 0, night)).toBe(true); // Pacific at midnight: night
    expect(pointInFeature(0, 80, night)).toBe(false); // Arctic in June at noon: day
    expect(pointInFeature(175, 80, night)).toBe(false); // Arctic at midnight in June: still light
    expect(pointInFeature(0, -80, night)).toBe(true); // Antarctic in June: dark even at noon
  });
});
