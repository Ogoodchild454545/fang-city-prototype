// UI colour themes (v0.9.2). Pure data + helpers so it can be tested in node; the CSS lives in css/themes.css.
// The choice is a device setting (localStorage), separate from the game save, so it survives a reset and
// applies before the save loads. Battles (operations) always use the original look.
export const THEME_KEY = 'fangcity.theme';
export const DEFAULT_THEME = 'rainy';
export const THEMES = [
  { id: 'rainy', name: 'Rainy Night Cop', blurb: 'Rain-slick blue glass, police-light red and blue.', sw: ['#13304f', '#4f82b8', '#ff3b4d', '#5cc2ff'] },
  { id: 'dark', name: 'Original Dark', blurb: 'The first Fang City look: black, blood red and gold.', sw: ['#0b0a0a', '#1c1918', '#c9302c', '#e0a526'] },
  { id: 'neon', name: 'Neon Noir', blurb: 'Night city with hot pink and teal trim.', sw: ['#0d0f1c', '#2a3050', '#ff3d8b', '#2ee6d6'] },
  { id: 'rust', name: 'Rusted Dockyard', blurb: 'Steel plates, rust orange, hazard stripes.', sw: ['#2b2e31', '#55595d', '#ff7a1a', '#ffcc1f'] },
  { id: 'novel', name: 'Graphic Novel', blurb: 'Comic ink outlines on cream paper.', sw: ['#3a2c4a', '#efe4cc', '#a2344a', '#2f7f86'] },
  { id: 'luxe', name: 'Gangster Luxe', blurb: 'Green felt, brass and gold.', sw: ['#0b2219', '#1a4a35', '#e3bf5b', '#f4ead2'] },
  { id: 'evidence', name: 'Evidence Board', blurb: 'Corkboard, Polaroids and red string.', sw: ['#a47a4f', '#f3ead2', '#b0201c', '#f2d36b'] },
  { id: 'graffiti', name: 'Street Graffiti', blurb: 'Concrete with lime and orange spray.', sw: ['#5d6064', '#2a2c2f', '#b6ff2e', '#ff6a13'] },
  { id: 'sepia', name: 'Sepia Prohibition', blurb: 'Whisky amber, aged paper, art deco.', sw: ['#4a2c14', '#ead7b0', '#a8701a', '#8c2a12'] },
  { id: 'modern', name: 'Clean Modern Mafia', blurb: 'Charcoal, white cards, one bold red.', sw: ['#202124', '#ffffff', '#e0161e', '#16171a'] },
];
export const THEME_IDS = THEMES.map((t) => t.id);
// Screens that never take a theme: the operations themselves.
export const UNTHEMED_TABS = ['battle', 'tactics'];

export function validTheme(id) { return THEME_IDS.includes(id) ? id : DEFAULT_THEME; }
export function loadTheme(ls) { try { return validTheme(ls && ls.getItem(THEME_KEY)); } catch { return DEFAULT_THEME; } }
export function saveTheme(ls, id) { const t = validTheme(id); try { ls && ls.setItem(THEME_KEY, t); } catch { /* private mode */ } return t; }
// What <html data-theme> should be for a theme on a given screen (null = no attribute = original look).
export function themeAttr(id, tab) {
  if (UNTHEMED_TABS.includes(tab)) return null;
  const t = validTheme(id);
  return t === 'dark' ? null : t;
}
