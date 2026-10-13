// Dates are local calendar days as 'YYYY-MM-DD'. Day arithmetic runs in UTC so DST shifts can't add or lose a day.
const toUtc = d => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));

export const today = () => new Date().toLocaleDateString('en-CA');

// Inclusive: 3 May to 5 May is 3 days.
export const daysBetween = (from, to) => Math.round((toUtc(to) - toUtc(from)) / 86400000) + 1;

export const addDays = (date, n) => new Date(toUtc(date) + n * 86400000).toISOString().slice(0, 10);

// The visit's last day for a stay of `days` days starting on `from`.
export const endAfter = (from, days) => addDays(from, days - 1);
