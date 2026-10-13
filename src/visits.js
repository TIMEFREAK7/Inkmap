// Visits and the counts derived from them. Counts are always computed from visits, never stored.

export function makeVisit(place, country, { date, dateTo, source = 'manual', exitedAirport = true, note = '' }) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    geonameId: place.id,
    name: place.name, // shown in lists without loading the 11 MB places file
    countryCode: place.cc,
    admin1Code: place.admin1,
    continent: country.continent,
    lat: place.lat,
    lon: place.lon,
    dateFrom: date,
    dateTo: dateTo || undefined, // optional last day; duration is computed from the two
    note,
    source,
    // Counting rule: only visits where the person left the airport count. Manual logs are real visits.
    exitedAirport,
    createdAt: now,
    updatedAt: now,
  };
}

export function stats(visits, totalCountries) {
  const counted = visits.filter(v => v.exitedAirport);
  const countries = new Set(counted.map(v => v.countryCode));
  return {
    continents: new Set(counted.map(v => v.continent)).size,
    countries: countries.size,
    cities: new Set(counted.map(v => v.geonameId)).size,
    worldPercent: totalCountries ? (countries.size / totalCountries) * 100 : 0,
    visitedCodes: [...countries],
  };
}

export const CONTINENTS = ['Asia', 'Europe', 'Africa', 'North America', 'South America', 'Oceania', 'Antarctica'];

// One hue per continent, for rings now and passport stamp ink later.
export const CONTINENT_HUES = {
  'Asia': '#ef6f6c', 'Europe': '#6ea8fe', 'Africa': '#f2b84b', 'North America': '#4fd1a5',
  'South America': '#b28dff', 'Oceania': '#38c6e0', 'Antarctica': '#d7dee8',
};

// Per continent: visited countries out of all countries there, for the Stats rings.
export function continentProgress(visitedCodes, countryList) {
  const visited = new Set(visitedCodes);
  return CONTINENTS.map(continent => {
    const all = countryList.filter(c => c.continent === continent);
    return { continent, total: all.length, visited: all.filter(c => visited.has(c.code)).length };
  });
}

// "3 May 2024" or "3–9 May 2024 · 7 days"; the locale decides day/month order.
export function describeDates(v) {
  const fmt = d => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  if (!v.dateTo || v.dateTo === v.dateFrom) return fmt(v.dateFrom);
  const days = Math.round((Date.parse(v.dateTo) - Date.parse(v.dateFrom)) / 86400000) + 1;
  return `${fmt(v.dateFrom)} – ${fmt(v.dateTo)} · ${days} days`;
}
