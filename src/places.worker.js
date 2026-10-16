import { parsePlaces, parseAirports } from './data.js';
import { buildIndex, search } from './search.js';
import { gridOf, photoTrips, airportCity } from './backfill.js';

// Holds all 171k places and the search index off the main thread, so typing never stalls the globe.
let index, placeGrid, airportGrid, airportList;
const loadAirports = async url => {
  airportList ||= parseAirports(await fetch(url).then(r => r.text()));
  airportGrid ||= gridOf(airportList);
};
self.onmessage = async ({ data }) => {
  try { await handle(data); } catch (e) { self.postMessage({ id: data.id, error: String(e?.message || e) }); } // never leave a request hanging
};
async function handle(data) {
  if (data.type === 'load') {
    const t0 = performance.now();
    index = buildIndex(parsePlaces(await fetch(data.url).then(r => r.text())));
    self.postMessage({ id: data.id, count: index.places.length, ms: Math.round(performance.now() - t0) });
  } else if (data.type === 'search') {
    self.postMessage({ id: data.id, results: search(index, data.query) });
  } else if (data.type === 'trips') {
    placeGrid ||= gridOf(index.places);
    await loadAirports(data.airportsUrl);
    self.postMessage({ id: data.id, ...photoTrips(data.points, placeGrid, airportGrid, data.home) });
  } else if (data.type === 'airportCities') {
    placeGrid ||= gridOf(index.places);
    await loadAirports(data.airportsUrl);
    const cities = {};
    for (const code of data.codes) {
      const a = airportList.find(x => x.iata === code);
      if (a) cities[code] = airportCity(placeGrid, a);
    }
    self.postMessage({ id: data.id, cities });
  }
}
