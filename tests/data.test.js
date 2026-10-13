import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { m49Continent, trimAltNames, parseCsvLine } from '../data-pipeline/build.mjs';
import { parsePlaces } from '../src/data.js';

const countries = JSON.parse(fs.readFileSync('public/data/countries.json', 'utf8'));
const continentOf = code => countries.find(c => c.code === code)?.continent;

describe('continent table', () => {
  it('has every ISO entry plus Taiwan and Kosovo', () => {
    expect(countries).toHaveLength(250);
    expect(new Set(countries.map(c => c.code)).size).toBe(250);
    expect(countries.every(c => c.name && c.continent)).toBe(true);
  });

  it.each([
    ['TR', 'Asia'], ['RU', 'Europe'], ['EG', 'Africa'], ['GE', 'Asia'], ['AM', 'Asia'], ['AZ', 'Asia'],
    ['GL', 'North America'], ['RE', 'Africa'], ['HK', 'Asia'], ['PR', 'North America'], ['US', 'North America'],
    ['ES', 'Europe'], ['AQ', 'Antarctica'], ['TW', 'Asia'], ['XK', 'Europe'], ['BR', 'South America'], ['MX', 'North America'],
  ])('%s is in %s', (code, continent) => expect(continentOf(code)).toBe(continent));

  it('maps M49 regions to seven continents', () => {
    expect(m49Continent('Americas', 'Latin America and the Caribbean', 'Caribbean')).toBe('North America');
    expect(m49Continent('Americas', 'Latin America and the Caribbean', 'Central America')).toBe('North America');
    expect(m49Continent('Americas', 'Latin America and the Caribbean', 'South America')).toBe('South America');
    expect(m49Continent('', '', '')).toBe('Antarctica');
    expect(new Set(countries.map(c => c.continent)).size).toBe(7);
  });
});

describe('place data', () => {
  it('keeps names people type and drops codes and romanisations', () => {
    expect(trimAltNames('Bombay,BOM,bmbyy,मुंबई,Mumbai,Bombaim', 'Mumbai', 'Mumbai')).toEqual(['Bombay', 'Bombaim']);
  });

  it('parses the bundled places file, Bombay finds Mumbai', () => {
    const places = parsePlaces(fs.readFileSync('public/data/places.tsv', 'utf8'));
    expect(places.length).toBeGreaterThan(150000);
    const mumbai = places.find(p => p.alts.includes('Bombay'));
    expect(mumbai).toMatchObject({ name: 'Mumbai', cc: 'IN' });
  });

  it('parses quoted CSV fields', () => {
    expect(parseCsvLine('a,"b, c","d ""e"""')).toEqual(['a', 'b, c', 'd "e"']);
  });
});
