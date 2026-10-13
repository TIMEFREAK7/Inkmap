import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db.js';
import { buildBackup, parseBackup, restoreBackup, NewerBackupError, SCHEMA_VERSION } from '../src/backupFile.js';

const snapshot = async () => Object.fromEntries(await Promise.all(
  ['profile', 'visits', 'suggestions', 'family', 'settings'].map(async t => [t, await db.table(t).toArray()])));

describe('full backup', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map(t => t.clear()));
    await db.profile.add({ friendId: 'IM-7K3Q-9XWD', name: 'Aditya', colour: '#f6ad3b', createdAt: '2026-01-01T00:00:00Z' });
    await db.visits.bulkAdd([
      { id: 'v1', geonameId: 1275339, name: 'Mumbai', countryCode: 'IN', continent: 'Asia', dateFrom: '2024-05-03', dateTo: '2024-05-05', exitedAirport: true, createdAt: 'a' },
      { id: 'v2', geonameId: 745044, name: 'Istanbul', countryCode: 'TR', continent: 'Asia', dateFrom: '2023-01-01', exitedAirport: false, createdAt: 'b' },
    ]);
    await db.suggestions.add({ id: 's1', status: 'pending', geonameId: 1 });
    await db.family.add({ friendId: 'IM-AAAA-BBBB', name: 'Mom', visits: [] });
    await db.settings.add({ key: 'lastBackupAt', value: 'x' });
  });

  it('survives export, wipe and import with everything matching, friend ID included', async () => {
    const before = await snapshot();
    const text = JSON.stringify(await buildBackup(db));
    await Promise.all(db.tables.map(t => t.clear()));
    expect((await snapshot()).visits).toEqual([]);
    await restoreBackup(db, parseBackup(text));
    expect(await snapshot()).toEqual(before);
    expect((await db.profile.toArray())[0].friendId).toBe('IM-7K3Q-9XWD');
  });

  it('refuses a backup from a newer app version and changes nothing', async () => {
    const before = await snapshot();
    const newer = JSON.stringify({ ...(await buildBackup(db)), schemaVersion: SCHEMA_VERSION + 1 });
    expect(() => parseBackup(newer)).toThrow(NewerBackupError);
    expect(await snapshot()).toEqual(before);
  });

  it('refuses files that are not Inkmap backups', () => {
    expect(() => parseBackup('not json')).toThrow('not an Inkmap backup');
    expect(() => parseBackup('{"format":"something-else"}')).toThrow('not an Inkmap backup');
    expect(() => parseBackup(JSON.stringify({ format: 'inkmap-backup', schemaVersion: 1 }))).toThrow('incomplete');
  });
});
