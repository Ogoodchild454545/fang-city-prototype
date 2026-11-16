// Every ready-made map, in location order. Built by tools/build-maps.mjs (Docklands yard is the original).
import { DOCKLANDS } from './docklands.js';
import { FISH_WHARF } from './fish_wharf.js';
import { NEON_STRIP } from './neon_strip.js';
import { CLUB_VELVET } from './club_velvet.js';
import { GATOR_FARM } from './gator_farm.js';
import { FOUNDRY } from './foundry.js';
import { RAIL_SIDINGS } from './rail_sidings.js';
import { BACK_STREETS } from './back_streets.js';
import { CORNER_SHOP } from './corner_shop.js';

export const BUILTIN_MAPS = [DOCKLANDS, FISH_WHARF, NEON_STRIP, CLUB_VELVET, GATOR_FARM, FOUNDRY, RAIL_SIDINGS, BACK_STREETS, CORNER_SHOP];
export const BUILTIN_BY_ID = Object.fromEntries(BUILTIN_MAPS.map((j) => [j.id, j]));
export const isBuiltinId = (id) => !!BUILTIN_BY_ID[id];
