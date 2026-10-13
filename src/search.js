// Place search over names, ASCII names and alternate names ("Bombay" finds Mumbai). Runs inside the places worker.
export const norm = s => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

export function buildIndex(places) {
  const keys = [], owner = [], isName = [];
  places.forEach((p, i) => {
    const names = new Set([p.name, p.ascii].map(norm));
    for (const k of new Set([...names, ...p.alts.map(norm)])) {
      keys.push(k);
      owner.push(i);
      isName.push(names.has(k) ? 1 : 0);
    }
  });
  return { places, keys, owner: Int32Array.from(owner), isName: Uint8Array.from(isName) };
}

// Matches the start of the name or of any word in it ("york" finds New York), most populous first.
// Rank: exact name, exact alternate name ("Bombay"), name prefix, alternate-name prefix, a later word ("york").
export function search({ places, keys, owner, isName }, query, limit = 30) {
  const q = norm(query);
  if (!q) return [];
  const best = new Map(); // place index -> best rank
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const hit = k === q ? 0 : k.startsWith(q) ? 2 : k.includes(' ' + q) ? 4 : -1;
    if (hit < 0) continue;
    const rank = hit === 4 ? 4 : hit + (isName[i] ? 0 : 1);
    if (!(best.get(owner[i]) <= rank)) best.set(owner[i], rank);
  }
  return [...best]
    .sort((a, b) => a[1] - b[1] || places[b[0]].pop - places[a[0]].pop)
    .slice(0, limit)
    .map(([i]) => places[i]);
}
