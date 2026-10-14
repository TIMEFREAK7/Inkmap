// Bundled SVG flags (flag-icons, MIT). Emoji flags don't render on Windows, which shows two letters instead.
const FLAGS = import.meta.glob('/node_modules/flag-icons/flags/4x3/*.svg', { query: '?url', import: 'default', eager: true });
export const flagUrl = code => FLAGS[`/node_modules/flag-icons/flags/4x3/${code.toLowerCase()}.svg`];
