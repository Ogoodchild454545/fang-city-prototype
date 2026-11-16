// Player-made battle maps, kept in localStorage separately from the game save (so a save reset
// never deletes them). Pure functions over a Storage-like object for tests.
import { normalizeMapJson, mapFromJson, validateMap } from './mapfmt.js';
import { BUILTIN_BY_ID } from './maps/index.js';
export { BUILTIN_MAPS, isBuiltinId } from './maps/index.js';

export const MAPS_KEY = 'fangcity.maps.v1';
const store = (ls) => ls || (typeof localStorage !== 'undefined' ? localStorage : null);

export function listMaps(ls) {
  const st = store(ls);
  if (!st) return [];
  try {
    const all = JSON.parse(st.getItem(MAPS_KEY) || '{}');
    return Object.values(all).filter((j) => j && j.format).sort((a, b) => (b.saved || 0) - (a.saved || 0));
  } catch { return []; }
}
export function getMap(id, ls) {
  if (BUILTIN_BY_ID[id]) return BUILTIN_BY_ID[id];
  return listMaps(ls).find((j) => j.id === id) || null;
}
export function saveMap(json, ls) {
  const st = store(ls);
  const j = { ...normalizeMapJson(json), saved: Date.now() };
  delete j.seats; // custom maps always use spawn zones
  const all = JSON.parse(st.getItem(MAPS_KEY) || '{}');
  all[j.id] = j;
  st.setItem(MAPS_KEY, JSON.stringify(all));
  return j;
}
export function deleteMap(id, ls) {
  const st = store(ls);
  const all = JSON.parse(st.getItem(MAPS_KEY) || '{}');
  delete all[id];
  st.setItem(MAPS_KEY, JSON.stringify(all));
}
// Battle-ready map for an id (a built-in or a saved map). Null for the classic Docklands yard (the game's own) or if missing/invalid.
export function battleMapFor(id, ls) {
  const j = id && id !== 'docklands' ? getMap(id, ls) : null;
  if (j && validateMap(j).ok) return mapFromJson(j);
  return null;
}
