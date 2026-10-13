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

const stopo = JSON.parse(fs.readFileSync('public/data/states.topo.json', 'utf8'));
const states = feature(stopo, stopo.objects.states).features;
import { pointInFeature, fitBox } from '../src/geo.js';
const stateAt = (cc, lon, lat) => states.find(f => f.properties.iso_a2 === cc && pointInFeature(lon, lat, f))?.properties.name;

describe('state of a visited place', () => {
  it('finds the state by position, including countries whose state codes do not match GeoNames', () => {
    expect(stateAt('IN', 72.88, 19.07)).toBe('Maharashtra'); // Mumbai
    expect(stateAt('GB', -0.13, 51.51)).toBeTruthy(); // London: GB codes never match
    expect(stateAt('IT', 12.48, 41.89)).toBeTruthy(); // Rome
    expect(stateAt('ES', -3.70, 40.42)).toBe('Madrid');
  });
  it('is outside every state in the sea', () => expect(stateAt('IN', 70, 15)).toBeUndefined());
});

describe('country view framing', () => {
  it('opens the USA on the mainland, not on Alaska and the Pacific', () => {
    const [[w, s], [e, n]] = fitBox(shapes.US);
    expect(w).toBeGreaterThan(-130);
    expect(n).toBeLessThan(52);
  });
  it('widens to Hawaii once a place there is visited', () => {
    const [[w]] = fitBox(shapes.US, [[-157.86, 21.31]]);
    expect(w).toBeLessThan(-157);
  });
  it('keeps nearby islands: all of Japan, Tasmania with Australia', () => {
    const [[, s], [, n]] = fitBox(shapes.JP);
    expect(n).toBeGreaterThan(45); // Hokkaido
    expect(s).toBeLessThan(32); // Kyushu
    expect(fitBox(shapes.AU)[0][1]).toBeLessThan(-43); // Tasmania
  });
});

import { stateFor } from '../src/geo.js';
const stateOf = (cc, lon, lat) => stateFor(lon, lat, states.filter(f => f.properties.iso_a2 === cc))?.properties.name;

describe('state of a coastal place', () => {
  it('falls back to the nearest state when simplification leaves the city offshore', () => {
    expect(stateOf('JP', 139.69, 35.69)).toBe('Tokyo');
    expect(stateOf('US', -74.006, 40.7143)).toBe('New York'); // GeoNames' own point for New York City
    expect(stateOf('FR', 2.3488, 48.8534)).toBe('Île-de-France');
  });
  it('does not reach far out to sea', () => expect(stateOf('IN', 65, 12)).toBeUndefined());
});

describe('state level people recognise', () => {
  it('uses regions where Natural Earth units are smaller than a city', () => {
    expect(stateOf('GB', -0.1257, 51.5085)).toBe('Greater London');
    expect(stateOf('GB', -3.1965, 55.9521)).toBe('Scotland');
    expect(stateOf('GB', -3.1791, 51.4816)).toBe('Wales');
    expect(stateOf('IT', 12.4839, 41.8947)).toBe('Lazio');
  });
  it('keeps prefectures and states elsewhere', () => {
    expect(stateOf('JP', 139.6917, 35.6895)).toBe('Tokyo');
    expect(stateOf('US', -87.65, 41.85)).toBe('Illinois');
  });
});
