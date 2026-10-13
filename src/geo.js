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
