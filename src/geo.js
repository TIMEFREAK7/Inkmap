// Bounding box [[west, south], [east, north]] of a GeoJSON feature, for fitting a flat map to one country.
// Countries that cross the 180° line (Russia, Fiji, the USA with the Aleutians) would otherwise span the whole world,
// so longitudes are also measured on 0..360 and the narrower box wins (its east edge may then exceed 180).
export function bboxOf(feature) {
  let s = 90, n = -90, w = 180, e = -180, w2 = 360, e2 = 0;
  const visit = c => {
    if (typeof c[0] === 'number') {
      const [lon, lat] = c, lon2 = lon < 0 ? lon + 360 : lon;
      s = Math.min(s, lat); n = Math.max(n, lat);
      w = Math.min(w, lon); e = Math.max(e, lon);
      w2 = Math.min(w2, lon2); e2 = Math.max(e2, lon2);
    } else c.forEach(visit);
  };
  visit(feature.geometry.coordinates);
  if (e2 - w2 < e - w) return [[w2 > 180 ? w2 - 360 : w2, s], [e2 > 180 && w2 > 180 ? e2 - 360 : e2, n]];
  return [[w, s], [e, n]];
}

const polygonsOf = g => (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);

// Ray casting on the outer ring, minus holes. Plain lon/lat is fine at the scale of one state.
function inRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export const pointInFeature = (lon, lat, f) =>
  polygonsOf(f.geometry).some(([outer, ...holes]) => inRing(lon, lat, outer) && !holes.some(h => inRing(lon, lat, h)));

const ringArea = ring => Math.abs(ring.reduce((a, [x1, y1], i) => {
  const [x2, y2] = ring[(i + 1) % ring.length];
  return a + x1 * y2 - x2 * y1;
}, 0)) / 2;

const NEAR_DEG = 6; // keeps Hokkaido, Tasmania, Shetland; drops the Alaska panhandle islands next to the US mainland

// The box a country view opens on: the main landmass and islands near it (Japan's islands, Tasmania, Corsica),
// plus every place the person visited there, so far-off parts (Alaska, Hawaii, Réunion) only widen the view when visited.
export function fitBox(feature, points = []) {
  const parts = polygonsOf(feature.geometry).map(p => {
    const [[w, s], [e, n]] = bboxOf({ geometry: { coordinates: p } });
    return { p, area: ringArea(p[0]), w, s, e, n };
  });
  const main = parts.reduce((a, b) => (b.area > a.area ? b : a));
  // By each part's middle, not its edge: Alaska's panhandle reaches near Washington State, its bulk does not.
  const near = parts.filter(q => {
    const x = (q.w + q.e) / 2, y = (q.s + q.n) / 2;
    return x >= main.w - NEAR_DEG && x <= main.e + NEAR_DEG && y >= main.s - NEAR_DEG && y <= main.n + NEAR_DEG;
  });
  return bboxOf({ geometry: { coordinates: [...near.map(q => q.p), points.map(([lon, lat]) => [lon, lat])] } });
}

// Squared distance from a point to a line segment, in degrees (fine over a few tens of km).
function segDist2(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  return (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2;
}

// The state a place is in. Coastlines in the data can leave a coastal city (Tokyo, New York) just offshore,
// so if no state contains it, take the state whose border passes closest, within ~0.3° (about 30 km).
export function stateFor(lon, lat, features) {
  const inside = features.find(f => pointInFeature(lon, lat, f));
  if (inside) return inside;
  let best = null, bestD = 0.09; // squared degrees
  for (const f of features) {
    for (const poly of polygonsOf(f.geometry)) {
      const ring = poly[0];
      for (let i = 1; i < ring.length; i++) {
        const d = segDist2(lon, lat, ring[i - 1], ring[i]);
        if (d < bestD) { bestD = d; best = f; }
      }
    }
  }
  return best;
}
