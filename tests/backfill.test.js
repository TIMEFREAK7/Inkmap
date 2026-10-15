import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { parsePlaces, parseAirports } from '../src/data.js';
import { gridOf, cityAt, photoTrips, unseenTrips, airportCity } from '../src/backfill.js';

const places = gridOf(parsePlaces(fs.readFileSync('public/data/places.tsv', 'utf8')));
const airportList = parseAirports(fs.readFileSync('public/data/airports.tsv', 'utf8'));
const airports = gridOf(parseAirports(fs.readFileSync('public/data/airports.tsv', 'utf8')));
const at = (lat, lon) => cityAt(places, lat, lon)?.name;

describe('which city a photo belongs to', () => {
  it('a Delhi neighbourhood counts as Delhi', () => expect(at(28.6519, 77.1909)).toBe('Delhi'));
  it('central Mumbai counts as Mumbai', () => expect(at(18.94, 72.835)).toBe('Mumbai'));
  it('central London counts as London', () => expect(at(51.5101, -0.1340)).toBe('London'));
  it('a separate town next to a big city keeps its own name', () => expect(at(28.4595, 77.0266)).toMatch(/Gurgaon|Gurugram/));
  it('the middle of the ocean is no city', () => expect(at(0, -140)).toBeUndefined());
});

describe('photo trips', () => {
  const pt = (lat, lon, day) => ({ lat, lon, day });
  const { trips, skipped } = photoTrips([
    pt(48.8584, 2.2945, '2024-05-01'), pt(48.8606, 2.3376, '2024-05-02'), pt(48.86, 2.34, '2024-05-02'),
    pt(48.8584, 2.2945, '2024-05-09'),
    pt(19.0896, 72.8656, '2024-04-30'), // Mumbai airport
  ], places, airports);

  it('skips photos taken at an airport', () => expect(skipped).toBe(1));
  it('joins consecutive days in one city and splits after a gap', () => {
    expect(trips.map(t => [t.place.name, t.dateFrom, t.dateTo, t.photos])).toEqual([
      ['Paris', '2024-05-09', '2024-05-09', 1],
      ['Paris', '2024-05-01', '2024-05-02', 3],
    ]);
  });
  it('skips photos around the home town, suburbs included', () => {
    const pune = { lat: 18.5196, lon: 73.8553 };
    const r = photoTrips([pt(18.5204, 73.8567, '2024-01-01'), pt(18.6298, 73.7997, '2024-01-02'), pt(18.94, 72.835, '2024-01-03')], places, airports, pune);
    expect(r.trips.map(t => t.place.name)).toEqual(['Mumbai']);
    expect(r.skipped).toBe(2);
  });
  it('drops trips already logged or already suggested', () => {
    const paris = trips[0].place.id;
    expect(unseenTrips(trips, [{ geonameId: paris, dateFrom: '2024-05-02' }], [])).toHaveLength(1);
    expect(unseenTrips(trips, [], [{ geonameId: paris, dateFrom: '2024-05-08', dateTo: '2024-05-10', status: 'rejected' }])).toHaveLength(1);
    expect(unseenTrips(trips, [{ geonameId: 1, dateFrom: '2024-05-01' }], [])).toHaveLength(2);
  });
});

describe('airport to city', () => {
  const city = iata => airportCity(places, airportList.find(a => a.iata === iata))?.name;
  it('maps airports to the city they serve, even far out of town', () => {
    expect(city('BLR')).toMatch(/Bengaluru|Bangalore/);
    expect(city('BOM')).toBe('Mumbai');
    expect(city('PNQ')).toBe('Pune');
    expect(city('CDG')).toBe('Paris');
    expect(city('JFK')).toBe('New York City');
  });
});
