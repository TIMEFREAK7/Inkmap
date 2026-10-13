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

import { pointInFeature, fitBox, areaFor } from '../src/geo.js';

// One country's geoBoundaries file: { adm1: [...states], adm2: [...districts] }.
const regions = cc => {
  const topo = JSON.parse(fs.readFileSync(`public/data/regions/${cc}.json`, 'utf8'));
  return Object.fromEntries(Object.keys(topo.objects).map(k => [k, feature(topo, topo.objects[k]).features]));
};
import { norm } from '../src/search.js';
const areaOf = (cc, level, lon, lat) => norm(areaFor(lon, lat, regions(cc)[level])?.properties.shapeName ?? '') || undefined; // sources spell with accents (Mahārāshtra)

describe('state and district of a visited place', () => {
  it('finds the state by position', () => {
    expect(areaOf('IN', 'adm1', 72.8826, 19.0728)).toMatch(/Maharashtra/i); // Mumbai
    expect(areaOf('US', 'adm1', -87.65, 41.85)).toBe('illinois'); // Chicago
    expect(areaOf('US', 'adm1', -74.006, 40.7143)).toBe('new york'); // New York City, not New Jersey
    expect(areaOf('JP', 'adm1', 139.6917, 35.6895)).toMatch(/Tokyo/i);
  });
  it('finds the district a city is in', () => {
    expect(areaOf('IN', 'adm2', 72.8826, 19.0728)).toMatch(/Mumbai/i);
    expect(areaOf('US', 'adm2', -87.65, 41.85)).toMatch(/Cook/i); // Chicago is in Cook County
    expect(areaOf('FR', 'adm2', 2.3488, 48.8534)).toMatch(/Paris/i);
  });
  it('does not reach far out to sea', () => expect(areaOf('IN', 'adm1', 65, 12)).toBeUndefined());
  it('ray casting respects holes', () => {
    const square = { geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]] } };
    expect(pointInFeature(1, 1, square)).toBe(true);
    expect(pointInFeature(5, 5, square)).toBe(false);
  });
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

