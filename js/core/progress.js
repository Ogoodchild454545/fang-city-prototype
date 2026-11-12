// Operator XP, XCOM-style ranks and perk choices. Level is kept on the hero record.
import { HEROES, defOf } from './heroes.js';

export const MAX_LV = 10;
// XP needed to go from this level to the next.
export const XP_TO_NEXT = [0, 60, 80, 100, 130, 160, 200, 240, 290, 350];
export const RANK_NAME = ['', 'Rookie', 'Street', 'Hardened', 'Veteran', 'Sergeant', 'Sharp', 'Lieutenant', 'Captain', 'Major', 'Kingpin'];
export const PERK_AT = [3, 5, 7, 10];

export const PERKS = {
  grouping: { id: 'grouping', name: 'Tight Grouping', text: '+8 aim', aim: 8 },
  pockets:  { id: 'pockets',  name: 'Extra Pockets',  text: '+2 ammo carry', carry: 2 },
  iron:     { id: 'iron',     name: 'Second Wind',    text: '+2 max HP', hp: 2 },
  cool:     { id: 'cool',     name: 'Cool Head',      text: '+10 aim if you have not moved this turn' },
  field:    { id: 'field',    name: 'Field Dressing', text: 'Medkits heal +2', heal: 2 },
  bully:    { id: 'bully',    name: 'Flank Bite',     text: '+1 damage when the target is flanked' },
  runner:   { id: 'runner',   name: 'Runner',         text: '+1 move', move: 1 },
  trigger:  { id: 'trigger',  name: 'Hair Trigger',   text: 'Overwatch shots drop the usual aim penalty' },
};

const ROLE_POOL = {
  Assault:  ['grouping', 'pockets', 'bully', 'iron'],
  Scout:    ['runner', 'pockets', 'cool', 'trigger'],
  Marksman: ['grouping', 'cool', 'trigger', 'pockets'],
  Anchor:   ['iron', 'field', 'pockets', 'grouping'],
  Support:  ['field', 'cool', 'iron', 'pockets'],
  Breacher: ['pockets', 'bully', 'runner', 'iron'],
  Closer:   ['bully', 'runner', 'iron', 'grouping'],
  Heavy:    ['iron', 'pockets', 'bully', 'field'],
};

export const rankName = (lv) => RANK_NAME[Math.max(1, Math.min(MAX_LV, lv || 1))];
export const xpToNext = (lv) => (lv >= MAX_LV ? 0 : XP_TO_NEXT[lv] || 0);
export const isPerkLevel = (lv) => PERK_AT.includes(lv);

export function levelBonus(lv) {
  const n = Math.max(1, lv || 1) - 1;
  return { hp: n, aim: n };
}

export function perkMods(perks = []) {
  const m = { hp: 0, aim: 0, carry: 0, move: 0, heal: 0 };
  for (const id of perks) {
    const p = PERKS[id]; if (!p) continue;
    if (p.hp) m.hp += p.hp;
    if (p.aim) m.aim += p.aim;
    if (p.carry) m.carry += p.carry;
    if (p.move) m.move += p.move;
    if (p.heal) m.heal += p.heal;
  }
  return m;
}

export function perkChoices(heroId, already = []) {
  const role = (HEROES[heroId] || defOf(heroId) || {}).role;
  const pool = (ROLE_POOL[role] || Object.keys(PERKS)).filter((id) => !already.includes(id));
  const leftover = Object.keys(PERKS).filter((id) => !already.includes(id) && !pool.includes(id));
  const picks = pool.concat(leftover);
  return picks.slice(0, 2);
}

export function addXp(rec, amount) {
  rec.lv = rec.lv || 1;
  rec.xp = rec.xp || 0;
  rec.perks = rec.perks || [];
  const gained = [];
  if (rec.lv >= MAX_LV) { rec.xp = 0; return gained; }
  rec.xp += Math.max(0, amount | 0);
  while (rec.lv < MAX_LV) {
    const need = xpToNext(rec.lv);
    if (rec.xp < need) break;
    rec.xp -= need;
    rec.lv += 1;
    const ev = { lv: rec.lv, rank: rankName(rec.lv), perk: isPerkLevel(rec.lv) };
    if (ev.perk) rec.pendingPerk = ev.pending = true;
    gained.push(ev);
  }
  if (rec.lv >= MAX_LV) rec.xp = 0;
  return gained;
}

export function pickPerk(rec, perkId) {
  if (!PERKS[perkId]) return { ok: false, reason: 'Unknown perk' };
  rec.perks = rec.perks || [];
  if (rec.perks.includes(perkId)) return { ok: false, reason: 'Already learned' };
  rec.perks.push(perkId);
  rec.pendingPerk = false;
  return { ok: true, perk: PERKS[perkId] };
}

export function xpFromBattle(unit, win, highStakes) {
  let xp = (unit.kills || 0) * 25 + (unit.hp > 0 ? 15 : 0) + (win ? 20 : 0);
  if (highStakes) xp = Math.round(xp * 2);
  return xp;
}

export function resetAfterKo(rec) {
  const lost = { lv: rec.lv || 1, xp: rec.xp || 0, perks: (rec.perks || []).slice(), gear: rec.gear || null, rank: rankName(rec.lv || 1) };
  rec.lv = 1;
  rec.xp = 0;
  rec.perks = [];
  rec.pendingPerk = false;
  rec.gear = null; // taken by the opponent; not returned to stock
  return lost;
}
