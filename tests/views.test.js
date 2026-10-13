import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { feature } from 'topojson-client';
import { bboxOf } from '../src/geo.js';
import { continentProgress, describeDates, CONTINENTS } from '../src/visits.js';

const topo = JSON.parse(fs.readFileSync('public/data/countries.topo.json', 'utf8'));
const shapes = Object.fromEntries(feature(topo, topo.objects.countries).features.map(f => [f.properties.iso, f]));
const countries = JSON.parse(fs.readFileSync('public/data/countries.json', 'utf8'));

describe('fitting a flat map to a country', () => {
  it('boxes an ordinary country tightly', () => {
    const [[w, s], [e, n]] = bboxOf(shapes.IN);
    expect([w, s, e, n].map(Math.round)).toEqual([68, 7, 97, 35]);
  });
  it('does not stretch Fiji or Russia across the whole world', () => {
    for (const code of ['FJ', 'RU']) {
      const [[w], [e]] = bboxOf(shapes[code]);
      expect(e - w).toBeLessThan(200);
      expect(e).toBeGreaterThan(w);
    }
  });
});

describe('continent progress', () => {
  it('counts visited countries out of each continent', () => {
    const p = continentProgress(['IN', 'TR', 'FR'], countries);
    expect(p.map(x => x.continent)).toEqual(CONTINENTS);
    expect(p.find(x => x.continent === 'Asia').visited).toBe(2);
    expect(p.find(x => x.continent === 'Europe').visited).toBe(1);
    expect(p.reduce((a, x) => a + x.total, 0)).toBe(250);
  });
});

describe('visit dates', () => {
  it('shows a single day or a range with its length', () => {
    expect(describeDates({ dateFrom: '2024-05-03' })).not.toContain('days');
    expect(describeDates({ dateFrom: '2024-05-03', dateTo: '2024-05-09' })).toMatch(/7 days$/);
  });
});
