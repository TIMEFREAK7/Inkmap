// Family share file (.inkshare): one person's own map, sent by WhatsApp or similar and imported on another phone.
import { parseFriendId } from './friendId.js';
import { CONTINENTS } from './visits.js';

export const SHARE_FORMAT = 'inkmap-share';
export const SHARE_VERSION = 1;

const VISIT_FIELDS = ['geonameId', 'name', 'countryCode', 'admin1Code', 'continent', 'lat', 'lon', 'dateFrom', 'dateTo', 'exitedAirport'];

// Only your own profile and visits: no family members (no re-sharing), no suggestions, no notes.
export function buildShare(profile, visits) {
  return {
    format: SHARE_FORMAT, schemaVersion: SHARE_VERSION, exportedAt: new Date().toISOString(),
    friendId: profile.friendId, name: profile.name, colour: profile.colour,
    visits: visits.map(v => Object.fromEntries(VISIT_FIELDS.filter(k => v[k] !== undefined).map(k => [k, v[k]]))),
  };
}

export class NewerShareError extends Error {
  constructor() { super('This file was made by a newer Inkmap. Please update the app, then try again.'); }
}

const DAMAGED = 'This file is damaged or is not an Inkmap family file.';
const isDate = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d));

// The file comes from outside the app: check every field and keep only what the app uses. All or nothing.
export function parseShare(text, countryCodes) {
  let d;
  try { d = JSON.parse(text); } catch { throw new Error(DAMAGED); }
  if (d?.format !== SHARE_FORMAT) throw new Error(d?.format === 'inkmap-backup'
    ? 'This is a full backup, not a family file. Restore backups from the first-launch screen.' : DAMAGED);
  if (!(d.schemaVersion <= SHARE_VERSION)) throw new NewerShareError();
  const friendId = typeof d.friendId === 'string' && parseFriendId(d.friendId);
  if (!friendId || friendId !== d.friendId) throw new Error(DAMAGED);
  if (typeof d.name !== 'string' || !d.name.trim() || d.name.length > 40) throw new Error(DAMAGED);
  if (typeof d.colour !== 'string' || !/^#[0-9a-f]{6}$/i.test(d.colour)) throw new Error(DAMAGED);
  if (!isDate(d.exportedAt?.slice(0, 10)) || isNaN(Date.parse(d.exportedAt))) throw new Error(DAMAGED);
  if (!Array.isArray(d.visits) || d.visits.length > 100000) throw new Error(DAMAGED);
  const visits = d.visits.map(v => {
    const ok = v && Number.isInteger(v.geonameId) && typeof v.name === 'string' && v.name.length <= 200
      && countryCodes.has(v.countryCode) && CONTINENTS.includes(v.continent)
      && Number.isFinite(v.lat) && Math.abs(v.lat) <= 90 && Number.isFinite(v.lon) && Math.abs(v.lon) <= 180
      && isDate(v.dateFrom) && (v.dateTo === undefined || isDate(v.dateTo)) && typeof v.exitedAirport === 'boolean'
      && (v.admin1Code === undefined || typeof v.admin1Code === 'string');
    if (!ok) throw new Error(DAMAGED);
    return Object.fromEntries(VISIT_FIELDS.filter(k => v[k] !== undefined).map(k => [k, v[k]]));
  });
  return { friendId, name: d.name.trim(), colour: d.colour, exportedAt: d.exportedAt, visits };
}

// The spec's import rules, in order. existing: this person's stored snapshot, if any.
export function decideImport(share, myFriendId, existing) {
  if (share.friendId === myFriendId) return 'own';
  if (!existing) return 'ask-add';
  if (Date.parse(share.exportedAt) <= Date.parse(existing.lastExportedAt)) return 'older';
  return 'replace';
}

// Adds or replaces the person's snapshot entirely. Only called after 'replace', or after the person tapped Add.
export async function applyImport(db, share) {
  const existing = await db.family.get(share.friendId);
  const now = new Date().toISOString();
  await db.family.put({
    friendId: share.friendId, name: share.name, colour: share.colour,
    addedAt: existing?.addedAt ?? now, lastExportedAt: share.exportedAt, lastImportedAt: now, visits: share.visits,
  });
}
