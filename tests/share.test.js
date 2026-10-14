import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { db } from '../src/db.js';
import { buildShare, parseShare, decideImport, applyImport, NewerShareError, SHARE_VERSION } from '../src/share.js';

const codes = new Set(JSON.parse(fs.readFileSync('public/data/countries.json', 'utf8')).map(c => c.code));
const ME = 'IM-7K3Q-9XW0';
const MOM = { friendId: 'IM-AB12-CD34', name: 'Mom', colour: '#f472b6' };
const visit = { id: 'x', geonameId: 1275339, name: 'Mumbai', countryCode: 'IN', admin1Code: '16', continent: 'Asia', lat: 19.07, lon: 72.88, dateFrom: '2024-05-03', dateTo: '2024-05-05', exitedAirport: true, note: 'private', createdAt: 'a' };
const momFile = (exportedAt, visits = [visit]) => JSON.stringify({ ...buildShare(MOM, visits), exportedAt });
const snapshot = async () => db.family.toArray();

// The whole import flow as the app runs it: parse, decide, apply only when allowed (ask-add needs the person's Add).
async function importFile(text, tapAdd) {
  const share = parseShare(text, codes);
  const decision = decideImport(share, ME, await db.family.get(share.friendId));
  if (decision === 'replace' || (decision === 'ask-add' && tapAdd)) await applyImport(db, share);
  return decision;
}

describe('family share import rules', () => {
  beforeEach(async () => { await db.family.clear(); });

  it('rule 1: rejects your own file', async () => {
    const own = JSON.stringify(buildShare({ friendId: ME, name: 'Aditya', colour: '#f6ad3b' }, [visit]));
    expect(await importFile(own, true)).toBe('own');
    expect(await snapshot()).toEqual([]);
  });

  it('rule 2: asks before adding someone new; Add stores them', async () => {
    expect(await importFile(momFile('2026-01-01T10:00:00Z'), true)).toBe('ask-add');
    const [mom] = await snapshot();
    expect(mom).toMatchObject({ friendId: MOM.friendId, name: 'Mom', lastExportedAt: '2026-01-01T10:00:00Z' });
    expect(mom.visits).toHaveLength(1);
  });

  it('rule 2: Cancel leaves the database unchanged', async () => {
    expect(await importFile(momFile('2026-01-01T10:00:00Z'), false)).toBe('ask-add');
    expect(await snapshot()).toEqual([]);
  });

  it('rule 3: rejects a file older than or the same as the stored copy', async () => {
    await importFile(momFile('2026-02-01T10:00:00Z'), true);
    const before = await snapshot();
    expect(await importFile(momFile('2026-01-01T10:00:00Z', []), true)).toBe('older');
    expect(await importFile(momFile('2026-02-01T10:00:00Z', []), true)).toBe('older');
    expect(await snapshot()).toEqual(before);
  });

  it('rule 4: a newer file replaces the snapshot entirely', async () => {
    await importFile(momFile('2026-01-01T10:00:00Z'), true);
    const newer = momFile('2026-03-01T10:00:00Z', [{ ...visit, geonameId: 745044, name: 'Istanbul', countryCode: 'TR' }]);
    expect(await importFile(newer, false)).toBe('replace');
    const [mom] = await snapshot();
    expect(mom.visits.map(v => v.name)).toEqual(['Istanbul']);
    expect(mom.lastExportedAt).toBe('2026-03-01T10:00:00Z');
  });

  it('refuses a file from a newer app version and changes nothing', async () => {
    const newer = JSON.stringify({ ...JSON.parse(momFile('2026-01-01T10:00:00Z')), schemaVersion: SHARE_VERSION + 1 });
    await expect(importFile(newer, true)).rejects.toThrow(NewerShareError);
    expect(await snapshot()).toEqual([]);
  });
});

describe('share file contents and validation', () => {
  it('carries only your own data: no notes, ids or family', () => {
    const s = buildShare({ ...MOM, extra: 'x' }, [visit]);
    expect(Object.keys(s).sort()).toEqual(['colour', 'exportedAt', 'format', 'friendId', 'name', 'schemaVersion', 'visits']);
    expect(s.visits[0]).not.toHaveProperty('note');
    expect(s.visits[0]).not.toHaveProperty('id');
  });

  it('rejects damaged or tampered files whole', () => {
    const good = JSON.parse(momFile('2026-01-01T10:00:00Z'));
    const bad = [
      'not json',
      JSON.stringify({ ...good, format: 'other' }),
      JSON.stringify({ ...good, friendId: 'IM-XXXX' }),
      JSON.stringify({ ...good, colour: 'red; background:url(x)' }),
      JSON.stringify({ ...good, visits: [{ ...good.visits[0], countryCode: 'ZZ' }] }),
      JSON.stringify({ ...good, visits: [{ ...good.visits[0], lat: 'x' }] }),
      JSON.stringify({ ...good, visits: [{ ...good.visits[0], dateFrom: '2024-13-45' }] }),
    ];
    for (const t of bad) expect(() => parseShare(t, codes)).toThrow();
  });

  it('points to restore when given a full backup', () => {
    expect(() => parseShare(JSON.stringify({ format: 'inkmap-backup' }), codes)).toThrow(/full backup/);
  });
});
