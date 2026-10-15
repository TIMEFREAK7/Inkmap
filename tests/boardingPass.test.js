import { describe, expect, it } from 'vitest';
import { parseBoardingPass, flightDate } from '../src/boardingPass.js';

// Mandatory part only (the IATA example): Montreal to Frankfurt, Air Canada 834, day 326.
const SIMPLE = 'M1DESMARAIS/LUC       EABC123 YULFRAAC 0834 326J001A0025 100';
// Two legs with conditional data; issued on day 120 of a year ending in 4.
const cond1 = '>6' + '0B' + 'O' + 'W' + 'W' + '4120' + 'B' + 'AI ';
const TWO = 'M2SHARMA/PRIYA        EXYZ789 PNQDELAI 0860 125Y012C0003 1' + cond1.length.toString(16).padStart(2, '0').toUpperCase() + cond1
  + 'XYZ789 DELJFKAI 0101 126Y034A0007 100';

describe('boarding pass barcode', () => {
  it('reads the airports, flight and date, not the name', () => {
    const legs = parseBoardingPass(SIMPLE, '2026-10-15');
    expect(legs).toEqual([{ from: 'YUL', to: 'FRA', carrier: 'AC', flight: '834', date: '2025-11-22' }]);
    expect(JSON.stringify(legs)).not.toMatch(/DESMARAIS|ABC123/);
  });
  it('reads every leg and takes the year from the issue date', () => {
    expect(parseBoardingPass(TWO, '2026-10-15')).toEqual([
      { from: 'PNQ', to: 'DEL', carrier: 'AI', flight: '860', date: '2024-05-04' },
      { from: 'DEL', to: 'JFK', carrier: 'AI', flight: '101', date: '2024-05-05' },
    ]);
  });
  it('refuses other codes', () => {
    expect(() => parseBoardingPass('https://example.com', '2026-10-15')).toThrow(/boarding pass/);
    expect(() => parseBoardingPass('M1DESMARAIS', '2026-10-15')).toThrow(/incomplete/);
    expect(() => parseBoardingPass('M1DESMARAIS/LUC       EABC123 Y12FRAAC 0834 326J001A0025 100', '2026-10-15')).toThrow(/can't be read/);
  });
});

describe('flight year', () => {
  it('without an issue date: the latest past day', () => {
    expect(flightDate(100, null, '2026-10-15')).toBe('2026-04-10');
    expect(flightDate(300, null, '2026-10-15')).toBe('2025-10-27');
  });
  it('with an issue date: same year, or the next if the flight day comes before the issue day', () => {
    expect(flightDate(130, '6120', '2026-10-15')).toBe('2026-05-10');
    expect(flightDate(10, '5350', '2026-10-15')).toBe('2026-01-10');
    expect(flightDate(10, '6350', '2026-10-15')).toBe('2017-01-10'); // issued "day 350 of 2026" is in the future, so 2016
  });
  it('skips day 366 in a year without it', () => expect(flightDate(366, '5001', '2026-10-15')).toBeNull());
});
