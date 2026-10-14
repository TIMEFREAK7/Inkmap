import { parsePlaces, parseAirports } from './data.js';
import { buildIndex, search } from './search.js';
import { gridOf, photoTrips } from './backfill.js';

// Holds all 171k places and the search index off the main thread, so typing never stalls the globe.
let index, placeGrid, airportGrid;
self.onmessage = async ({ data }) => {
  if (data.type === 'load') {
    const t0 = performance.now();
    index = buildIndex(parsePlaces(await fetch(data.url).then(r => r.text())));
    self.postMessage({ id: data.id, count: index.places.length, ms: Math.round(performance.now() - t0) });
  } else if (data.type === 'search') {
    self.postMessage({ id: data.id, results: search(index, data.query) });
  } else if (data.type === 'trips') {
    placeGrid ||= gridOf(index.places);
    airportGrid ||= gridOf(parseAirports(await fetch(data.airportsUrl).then(r => r.text())));
    self.postMessage({ id: data.id, ...photoTrips(data.points, placeGrid, airportGrid, data.home) });
  }
};
