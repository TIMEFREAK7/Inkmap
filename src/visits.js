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
