import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { parsePlaces } from '../src/data.js';
import { buildIndex, search, norm } from '../src/search.js';
import { eventQuery, eventDays, placeFromText } from '../src/calendar.js';

const index = buildIndex(parsePlaces(fs.readFileSync('public/data/places.tsv', 'utf8')));
const countryCodes = Object.fromEntries(JSON.parse(fs.readFileSync('public/data/countries.json', 'utf8')).map(c => [norm(c.name), c.code]));
const lookup = async q => search(index, q);
const place = async text => (await placeFromText(text, lookup, countryCodes))?.name;

describe('calendar events', () => {
  it('flights: destination from the title, not the departure airport in the location', () => {
    expect(eventQuery({ title: 'Flight to Delhi (AI 860)', location: 'Pune PNQ' })).toEqual({ text: 'Delhi' });
    expect(eventQuery({ title: 'AI 860 PNQ → DEL', location: '' })).toEqual({ iata: 'DEL' });
    expect(eventQuery({ title: 'Flight AI 860', location: 'Pune Airport' })).toBeNull();
  });
  it('other events: the location', () => {
    expect(eventQuery({ title: 'Stay at Taj', location: 'Colaba, Mumbai' })).toEqual({ text: 'Colaba, Mumbai' });
    expect(eventQuery({ title: 'Standup', location: '' })).toBeNull();
  });
  it('lists each day, capped', () => {
    expect(eventDays({ from: '2024-02-28', to: '2024-03-01' })).toEqual(['2024-02-28', '2024-02-29', '2024-03-01']);
    expect(eventDays({ from: '2024-01-01', to: '2024-12-31' })).toHaveLength(14);
  });
});

describe('place from an address', () => {
  it('finds the city before its neighbourhood', async () => {
    expect(await place('Taj Mahal Palace, Apollo Bandar, Colaba, Mumbai, Maharashtra 400001, India')).toBe('Mumbai');
  });
  it('uses the country to pick between same-named places', async () => {
    expect(await place('Hotel Lux, Paris, France')).toBe('Paris');
    expect(await place('Main Street, Paris, TX 75460, United States')).toBe('Paris');
    expect((await placeFromText('Main Street, Paris, TX 75460, United States', lookup, countryCodes)).cc).toBe('US');
  });
  it('a plain city name', async () => expect(await place('Goa')).toBeTruthy());
  it('nothing for a room name', async () => expect(await place('Conference room 4B')).toBeUndefined());
});
