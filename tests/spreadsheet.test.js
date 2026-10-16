import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { readSheet, parseCsv, parseDay, sheetTrips } from '../src/spreadsheet.js';

const countries = { france: 'FR', india: 'IN', japan: 'JP', thailand: 'TH', usa: 'US' };
const file = (bytes, name) => new File([bytes], name);

describe('trip list import', () => {
  it('reads every sheet of an .xlsx, each with its own columns', async () => {
    const { sheets, date1904 } = await readSheet(file(readFileSync('tests/fixtures/trips.xlsx'), 'trips.xlsx'));
    expect(sheets).toHaveLength(2);
    const a = sheetTrips(sheets[0], countries, date1904);
    expect(a.trips[0]).toEqual({ parts: ['Paris'], country: 'France', days: ['2015-03-12', '2015-03-13', '2015-03-14', '2015-03-15'] });
    expect(a.trips[1].parts).toEqual(['Delhi', 'Agra', 'Jaipur']); // one row, three cities
    expect(a.trips[2]).toMatchObject({ parts: ['Thailand'], days: ['2015-12-20'] });
    expect(a.undated).toBe(1); // Kyoto has no date
    const b = sheetTrips(sheets[1], countries, date1904);
    expect(b.trips).toEqual([{ parts: ['New York', 'USA'], country: '', days: ['2016-03-01'] }]);
  });

  it('reads CSV with quotes and semicolons, and US dates when the column says so', () => {
    expect(parseCsv('a;"b; c";"say ""hi"""\r\n1;2;3')).toEqual([['a', 'b; c', 'say "hi"'], ['1', '2', '3']]);
    const rows = parseCsv('Place,Date\n"Goa",03/25/2019\nKochi,04/02/2019');
    expect(sheetTrips(rows, countries).trips.map(t => t.days[0])).toEqual(['2019-03-25', '2019-04-02']);
  });

  it('understands the ways people write dates, day first unless it cannot be', () => {
    expect(parseDay('12/03/2015')).toBe('2015-03-12');
    expect(parseDay('12/03/2015', { mdy: true })).toBe('2015-12-03');
    expect(parseDay('2015-03-12')).toBe('2015-03-12');
    expect(parseDay('12 Mar 2015')).toBe('2015-03-12');
    expect(parseDay('March 12, 2015')).toBe('2015-03-12');
    expect(parseDay("Mar '15")).toBe('2015-03-01');
    expect(parseDay('2015')).toBe('2015-01-01');
    expect(parseDay(42075)).toBe('2015-03-12'); // an Excel date cell
    expect(parseDay('31/02/2015')).toBe(null);
    expect(parseDay('Holiday')).toBe(null);
    expect(parseDay('01/01/2999')).toBe(null); // planned, not been
  });

  it('refuses old .xls files with a way out', async () => {
    await expect(readSheet(file(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]), 'old.xls'))).rejects.toThrow('.xlsx');
  });
});
