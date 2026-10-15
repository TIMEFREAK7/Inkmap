// Tab bar icons (24 px line icons), drawn here so nothing is fetched. Decorative: the tab's text is the label.
const P = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
export const GlobeIcon = () => <svg {...P}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c-3 3-3 15 0 18M12 3c3 3 3 15 0 18" /></svg>;
export const StatsIcon = () => <svg {...P}><path d="M5 20V11M12 20V5M19 20v-6" /></svg>;
export const FamilyIcon = () => <svg {...P}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5" /><circle cx="17.5" cy="9" r="2.5" /><path d="M17 14.5c2.4.2 4 1.8 4.5 4.5" /></svg>;
export const StampIcon = () => <svg {...P}><rect x="4" y="4" width="16" height="16" rx="3" strokeDasharray="3 2.5" /><circle cx="12" cy="12" r="4" /></svg>;
