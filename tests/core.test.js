import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { parsePlaces } from '../src/data.js';
import { buildIndex, search } from '../src/search.js';
import { makeVisit, stats } from '../src/visits.js';

const countries = Object.fromEntries(JSON.parse(fs.readFileSync('public/data/countries.json', 'utf8')).map(c => [c.code, c]));
const places = parsePlaces(fs.readFileSync('public/data/places.tsv', 'utf8'));
const index = buildIndex(places);
const find = q => search(index, q)[0];

describe('place search', () => {
  it('finds places by alternate names: Bombay finds Mumbai', () => expect(find('Bombay')).toMatchObject({ name: 'Mumbai', cc: 'IN' }));
  it('puts the best-known place first', () => expect(find('paris')).toMatchObject({ cc: 'FR' }));
  it('ignores accents and case', () => expect(find('sao paulo')).toMatchObject({ cc: 'BR' }));
  it('matches the start of later words', () => expect(search(index, 'york').some(p => p.name === 'New York City')).toBe(true));
  it('returns nothing for an empty query', () => expect(search(index, '  ')).toEqual([]));
  it('caps the result list', () => expect(search(index, 'a').length).toBe(30));
});

const visit = (q, opts = {}) => {
  const p = find(q);
  return makeVisit(p, countries[p.cc], { date: '2024-05-01', ...opts });
};

describe('counting rules', () => {
  it('counts Turkey in Asia', () => expect(visit('Istanbul').continent).toBe('Asia'));
  it('counts Hawaii as the USA in North America', () => expect(visit('Honolulu')).toMatchObject({ countryCode: 'US', continent: 'North America' }));
  it('counts Greenland as its own country in North America', () => expect(visit('Nuuk')).toMatchObject({ countryCode: 'GL', continent: 'North America' }));
  it('counts Russia in Europe and Egypt in Africa', () => {
    expect(visit('Moscow').continent).toBe('Europe');
    expect(visit('Cairo').continent).toBe('Africa');
  });

  it('does not count an airport layover', () => {
    const s = stats([visit('Mumbai'), visit('Dubai', { exitedAirport: false })], 250);
    expect(s).toMatchObject({ countries: 1, continents: 1, cities: 1, visitedCodes: ['IN'] });
  });

  it('counts each country and city once, and the world percentage', () => {
    const s = stats([visit('Mumbai'), visit('Mumbai'), visit('Delhi'), visit('Istanbul'), visit('Honolulu'), visit('Nuuk')], 250);
    expect(s).toMatchObject({ countries: 4, continents: 2, cities: 5 });
    expect(s.worldPercent).toBeCloseTo(1.6);
  });
});

describe('search ranking', () => {
  it('ranks a place whose own name matches above one matched only by an alternate name', () => {
    expect(search(index, 'm').slice(0, 3).every(p => /^m/i.test(p.name))).toBe(true);
  });
});

import { byYear } from '../src/visits.js';
describe('timeline by year', () => {
  it('counts cities, countries and first visits per year, newest first, layovers left out', () => {
    const v = (id, cc, date, exitedAirport = true) => ({ geonameId: id, countryCode: cc, dateFrom: date, exitedAirport });
    expect(byYear([v(1, 'IN', '2023-01-01'), v(2, 'FR', '2024-05-01'), v(1, 'IN', '2024-06-01'), v(3, 'FR', '2024-06-02'), v(4, 'AE', '2024-07-01', false)])).toEqual([
      { year: 2024, cities: 3, countries: 2, newCountries: 1 },
      { year: 2023, cities: 1, countries: 1, newCountries: 1 },
    ]);
  });
});
