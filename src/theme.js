// App colour themes (token sets in styles.css). The choice is a display preference for this device.
export const THEMES = [
  { id: 'aurora', name: 'Aurora', swatch: '#5ee0c8' },
  { id: 'lagoon', name: 'Lagoon', swatch: '#8ab4ff' },
  { id: 'violet', name: 'Violet', swatch: '#cdb5ff' },
  { id: 'coral', name: 'Coral', swatch: '#ff8f80' },
  { id: 'amber', name: 'Amber', swatch: '#f6ad3b' },
];

export function savedTheme() {
  try { return localStorage.getItem('inkmap.theme') || 'aurora'; } catch { return 'aurora'; }
}

export function applyTheme(id) {
  if (id === 'aurora') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = id;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', cssVar('--surface'));
  try { localStorage.setItem('inkmap.theme', id); } catch { /* private mode: this session only */ }
}

// A token's current value, for MapLibre (which can't read CSS variables itself).
export const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
