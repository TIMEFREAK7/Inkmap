// IATA boarding pass barcodes (BCBP, Resolution 792): the text inside the PDF417, Aztec or QR code on every boarding pass.
// Only airports, flight and date are kept. The passenger name and booking reference are read past and never stored.

const LEG = 35; // PNR 7, from 3, to 3, carrier 3, flight 5, day of year 3, class 1, seat 4, sequence 5, status 1

const hex = s => (/^[0-9A-Fa-f]{2}$/.test(s) ? parseInt(s, 16) : NaN);

// Throws if the text isn't a boarding pass. today: 'YYYY-MM-DD', to work out the year (the barcode has none).
export function parseBoardingPass(text, today) {
  const t = String(text);
  const count = +t[1];
  if (t[0] !== 'M' || !(count >= 1 && count <= 4)) throw new Error("That code isn't a boarding pass.");
  let issued = null;
  const legs = [];
  let i = 23; // after format, leg count, name (20) and e-ticket flag
  for (let n = 0; n < count; n++) {
    const leg = t.slice(i, i + LEG);
    const size = hex(t.slice(i + LEG, i + LEG + 2));
    if (leg.length < LEG || Number.isNaN(size)) throw new Error("That boarding pass code is incomplete.");
    const cond = t.slice(i + LEG + 2, i + LEG + 2 + size);
    // First leg's conditional section: '>' version, unique size (hex), passenger description, check-in source,
    // issuing source, then the issue date as 'YDDD' (last digit of the year, day of year).
    if (n === 0 && cond[0] === '>' && hex(cond.slice(2, 4)) >= 7 && /^\d{4}$/.test(cond.slice(7, 11))) issued = cond.slice(7, 11);
    const from = leg.slice(7, 10), to = leg.slice(10, 13), day = +leg.slice(21, 24);
    if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to) || !(day >= 1 && day <= 366)) throw new Error("That boarding pass code can't be read.");
    legs.push({ from, to, carrier: leg.slice(13, 16).trim(), flight: leg.slice(16, 21).trim().replace(/^0+(?=\d)/, ''), date: flightDate(day, issued, today) });
    i += LEG + 2 + size;
  }
  return legs.filter(l => l.date);
}

const fromDayOfYear = (year, day) => {
  const d = new Date(Date.UTC(year, 0, day));
  return d.getUTCFullYear() === year ? d.toISOString().slice(0, 10) : null; // day 366 in a non-leap year
};

// The barcode only has the day of the year. With an issue date ('YDDD') the year follows from it (a pass is issued
// at most about a year before the flight); without one, it's the latest such day that isn't in the future.
export function flightDate(day, issued, today) {
  const thisYear = +today.slice(0, 4);
  if (issued) {
    let year = thisYear - ((thisYear - +issued[0] + 10) % 10);
    if (fromDayOfYear(year, +issued.slice(1)) > today) year -= 10;
    return fromDayOfYear(day >= +issued.slice(1) ? year : year + 1, day);
  }
  const date = fromDayOfYear(thisYear, day);
  return date && date <= today ? date : fromDayOfYear(thisYear - 1, day);
}
