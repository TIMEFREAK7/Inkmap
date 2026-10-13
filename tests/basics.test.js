import { describe, expect, it } from 'vitest';
import { daysBetween, endAfter, addDays } from '../src/dates.js';
import { newFriendId, parseFriendId } from '../src/friendId.js';

describe('visit duration', () => {
  it('counts days inclusively', () => {
    expect(daysBetween('2024-05-03', '2024-05-05')).toBe(3);
    expect(daysBetween('2024-05-03', '2024-05-03')).toBe(1);
  });
  it('crosses month and leap-year ends', () => {
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(3);
    expect(endAfter('2024-12-30', 4)).toBe('2025-01-02');
  });
  it('is not thrown off by daylight-saving changes', () => {
    expect(daysBetween('2024-03-30', '2024-04-01')).toBe(3);
    expect(addDays('2024-10-26', 2)).toBe('2024-10-28');
  });
});

describe('friend ID', () => {
  it('has the IM-XXXX-XXXX format without I, L, O or U', () => {
    for (let i = 0; i < 500; i++) expect(newFriendId()).toMatch(/^IM-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
  });
  it('is different each time', () => {
    expect(new Set(Array.from({ length: 1000 }, newFriendId)).size).toBe(1000);
  });
  it('accepts IDs typed loosely and reads ambiguous letters', () => {
    expect(parseFriendId('im 7k3q 9xwd')).toBe('IM-7K3Q-9XWD');
    expect(parseFriendId('IM7K3Q9XWD')).toBe('IM-7K3Q-9XWD');
    expect(parseFriendId('IM-7K3Q-9XW0')).toBe('IM-7K3Q-9XW0');
    expect(parseFriendId('IM-7K3Q-9XWO')).toBe('IM-7K3Q-9XW0'); // O typed for zero
    expect(parseFriendId('IM-L1I1-0000')).toBe('IM-1111-0000');
  });
  it('rejects things that are not IDs', () => {
    expect(parseFriendId('IM-7K3Q')).toBeNull();
    expect(parseFriendId('IM-7K3Q-9XWU')).toBeNull(); // U is never used
    expect(parseFriendId('hello world')).toBeNull();
  });
});
