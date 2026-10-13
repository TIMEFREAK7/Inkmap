import { parsePlaces } from './data.js';

// Parsing 171k places takes hundreds of ms; doing it here keeps the globe's frames free.
self.onmessage = async ({ data: url }) => {
  const t0 = performance.now();
  const places = parsePlaces(await fetch(url).then(r => r.text()));
  self.postMessage({ count: places.length, ms: Math.round(performance.now() - t0) });
};
