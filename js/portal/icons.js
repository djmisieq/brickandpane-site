// Line icons for the CRM (UX audit 27.11.2026): one set, 20 px, stroke 1.6, the colour of the text around them.
// Drawn for this site (no icon font, no CDN); aria-hidden, so the label next to each icon is what is read out.
const svg = (d) => `<svg class="ico" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export const ICON = {
  today: svg('<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>'),
  my: svg('<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.5 6 1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2"/>'),
  board: svg('<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="11" rx="1"/><rect x="17" y="4" width="4" height="7" rx="1"/>'),
  enquiries: svg('<path d="M4 5h16v11H8l-4 3z"/><path d="M8 9h8M8 12h5"/>'),
  calendar: svg('<rect x="3" y="5" width="18" height="16" rx="1.5"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  mail: svg('<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="m3.5 6 8.5 7 8.5-7"/>'),
  companies: svg('<path d="M4 21V5l8-2v18M12 9h8v12M4 21h16"/><path d="M7 8h2M7 12h2M7 16h2M15 13h2M15 17h2"/>'),
  quotes: svg('<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h7M9 16h7"/>'),
  owner: svg('<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>'),
  automations: svg('<path d="M13 3 5 13h6l-1 8 8-10h-6z"/>'),
  eye: svg('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>'),
  inbox: svg('<path d="M3 13h5l1.5 2.5h5L16 13h5"/><path d="M5 5h14l2 8v6H3v-6z"/>'),
  more: svg('<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  phone: svg('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z"/>'),
  map: svg('<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'),
  camera: svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  search: svg('<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>'),
  clock: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>'),
};
