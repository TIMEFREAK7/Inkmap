// "Postcard": the globe and the counts as one picture (1080×1350, the shape chat apps and Instagram show whole).
const W = 1080, H = 1350;

// Middle of the places on the sphere (a plain average of longitudes breaks across the Pacific), as [lon, lat].
export function centreOf(points) {
  if (!points.length) return [78, 20];
  let x = 0, y = 0, z = 0;
  for (const { lat, lon } of points) {
    const [p, l] = [(lat * Math.PI) / 180, (lon * Math.PI) / 180];
    x += Math.cos(p) * Math.cos(l); y += Math.cos(p) * Math.sin(l); z += Math.sin(p);
  }
  const lat = (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI;
  return [(Math.atan2(y, x) * 180) / Math.PI, Math.max(-60, Math.min(60, lat))]; // past 60° the globe shows mostly ice
}

const plural = (n, one, many) => (n === 1 ? one : many);

// globe: the square snapshot from Globe.jsx. Colours come from the current theme.
export async function drawPostcard(globe, { name, s, colours }) {
  await Promise.all(['700 80px "Space Grotesk"', '600 30px "Inter Variable"'].map(f => document.fonts.load(f))).catch(() => {});
  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const g = canvas.getContext('2d');
  g.fillStyle = colours.space;
  g.fillRect(0, 0, W, H);
  for (const [x, y, r, c] of [[0, 0, 900, colours.primary], [W, H * 0.55, 800, colours.glow]]) {
    const glow = g.createRadialGradient(x, y, 0, x, y, r);
    glow.addColorStop(0, c + '38'); // #rrggbb + alpha
    glow.addColorStop(1, c + '00');
    g.fillStyle = glow;
    g.fillRect(0, 0, W, H);
  }
  let seed = 7; // the same stars every time
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.fillStyle = '#ffffff';
  for (let i = 0; i < 140; i++) { g.globalAlpha = 0.25 + rand() * 0.5; g.beginPath(); g.arc(rand() * W, rand() * H, rand() * 1.6 + 0.4, 0, 7); g.fill(); }
  g.globalAlpha = 1;
  g.drawImage(globe, 70, 200, 940, 940);

  g.textBaseline = 'alphabetic';
  g.fillStyle = colours.primary;
  g.font = '600 30px "Inter Variable", sans-serif';
  g.letterSpacing = '6px';
  g.fillText('INKMAP', 80, 104);
  g.letterSpacing = '0px';
  g.fillStyle = colours.text;
  const title = `${name}'s world`;
  let size = 72;
  do g.font = `700 ${size}px "Space Grotesk", sans-serif`; while (g.measureText(title).width > W - 160 && (size -= 4) > 36);
  g.fillText(title, 80, 180);

  const counts = [[s.countries, plural(s.countries, 'country', 'countries')], [s.continents, plural(s.continents, 'continent', 'continents')], [s.cities, plural(s.cities, 'city', 'cities')]];
  g.textAlign = 'center';
  counts.forEach(([n, label], i) => {
    const x = 180 + i * 360;
    g.fillStyle = colours.primary;
    g.font = '700 96px "Space Grotesk", sans-serif';
    g.fillText(String(n), x, 1238);
    g.fillStyle = colours.muted;
    g.font = '600 32px "Inter Variable", sans-serif';
    g.fillText(label, x, 1290);
  });
  return new Promise((ok, fail) => canvas.toBlob(b => (b ? ok(b) : fail(new Error('Could not make the picture'))), 'image/jpeg', 0.9));
}
