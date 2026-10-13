// Friend IDs look like IM-7K3Q-9XWD: Crockford base32 (no I, L, O or U), so they can be read aloud.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function newFriendId() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const chars = [...bytes].map(b => ALPHABET[b & 31]).join('');
  return `IM-${chars.slice(0, 4)}-${chars.slice(4)}`;
}

// Accepts what a person types ("im 7k3q 9xwd", "IM7K3Q9XWD", O for 0, I/L for 1) and returns the canonical ID,
// or null if it can't be one.
export function parseFriendId(text) {
  const raw = text.toUpperCase().replace(/[\s-]/g, '').replace(/^IM/, '')
    .replace(/O/g, '0').replace(/[IL]/g, '1');
  if (!/^[0-9A-HJKMNP-TV-Z]{8}$/.test(raw)) return null;
  return `IM-${raw.slice(0, 4)}-${raw.slice(4)}`;
}
