import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { db } from '../src/db.js';
import { prunePhotos } from '../src/visitPhotos.js';
import { centreOf } from '../src/postcard.js';

describe('visit photos', () => {
  it('clears photos whose visit is gone and keeps the rest', async () => {
    await db.visits.add({ id: 'v1', geonameId: 1, countryCode: 'IN', dateFrom: '2024-01-01', createdAt: 'a' });
    await db.photos.bulkAdd([{ id: 'p1', visitId: 'v1', data: 'x' }, { id: 'p2', visitId: 'gone', data: 'x' }]);
    expect(await prunePhotos()).toBe(1);
    expect(await db.photos.toCollection().primaryKeys()).toEqual(['p1']);
  });
});

describe('postcard centre', () => {
  it('faces the middle of the places, across the date line too', () => {
    const [lon, lat] = centreOf([{ lat: 0, lon: 170 }, { lat: 0, lon: -170 }]);
    expect(Math.abs(Math.abs(lon) - 180)).toBeLessThan(1e-6); // not 0 (Africa), as a plain average would say
    expect(lat).toBeCloseTo(0);
    expect(centreOf([])).toEqual([78, 20]);
    expect(centreOf([{ lat: 89, lon: 0 }])[1]).toBe(60);
  });
});
