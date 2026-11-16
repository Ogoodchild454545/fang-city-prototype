// v0.11 Factory: a base building (player Lv 7) that crafts a chosen item from its blueprint,
// parts and Cash on a timer. One bench; finished pieces wait on the bench until collected.
import { ITEMS, QUALITY, BP_ITEMS, hasBlueprint, addItem } from './items.js';
import { isUnlocked } from './progression.js';

// Recipe cost by rarity (minutes on the bench).
export const RECIPE = {
  worn: { parts: 3, cash: 120, min: 2 },
  street: { parts: 6, cash: 300, min: 5 },
  tuned: { parts: 12, cash: 800, min: 20 },
  custom: { parts: 25, cash: 2000, min: 60 },
  legend: { parts: 50, cash: 6000, min: 180 },
};
export const recipeOf = (id) => ({ ...RECIPE[(ITEMS[id] || {}).q || 'worn'] });
export const factoryBuilt = (s) => isUnlocked(s, 'crafting') && ((s.base && s.base.buildings) || []).some((b) => b.t === 'factory' && b.lv >= 1);
// Ice to finish now: 1 per 6 minutes left, at least 2.
export const rushIce = (msLeft) => Math.max(2, Math.ceil(msLeft / 360000));

export function factoryJob(s, now = Date.now()) {
  const j = s.factory && s.factory.job;
  if (!j) return null;
  return { ...j, left: Math.max(0, j.end - now), done: now >= j.end, item: ITEMS[j.id] };
}
export function canCraft(s, id, now = Date.now()) {
  if (!factoryBuilt(s)) return { ok: false, reason: 'Build a Factory first' };
  if (!ITEMS[id] || !ITEMS[id].bp) return { ok: false, reason: 'No blueprint exists for that' };
  if (!hasBlueprint(s, id)) return { ok: false, reason: 'You need the blueprint' };
  if (factoryJob(s, now)) return { ok: false, reason: 'The bench is busy' };
  const r = recipeOf(id);
  if ((s.parts || 0) < r.parts) return { ok: false, reason: `Need ${r.parts} parts` };
  if ((s.cash || 0) < r.cash) return { ok: false, reason: `Need ${r.cash} Cash` };
  return { ok: true, recipe: r };
}
export function startCraft(s, id, now = Date.now()) {
  const c = canCraft(s, id, now);
  if (!c.ok) return c;
  s.parts -= c.recipe.parts; s.cash -= c.recipe.cash;
  s.factory = { job: { id, start: now, end: now + c.recipe.min * 60000 } };
  return { ok: true, id, end: s.factory.job.end };
}
export function collectCraft(s, now = Date.now()) {
  const j = factoryJob(s, now);
  if (!j) return { ok: false, reason: 'Nothing on the bench' };
  if (!j.done) return { ok: false, reason: 'Not finished yet' };
  addItem(s, j.id, 1);
  s.factory = null;
  s.stats.crafted = (s.stats.crafted || 0) + 1;
  return { ok: true, id: j.id, item: ITEMS[j.id] };
}
export function rushCraft(s, now = Date.now()) {
  const j = factoryJob(s, now);
  if (!j) return { ok: false, reason: 'Nothing on the bench' };
  if (j.done) return collectCraft(s, now);
  const ice = rushIce(j.left);
  if ((s.teeth || 0) < ice) return { ok: false, reason: `Need ${ice} Ice` };
  s.teeth -= ice;
  s.factory.job.end = now;
  return collectCraft(s, now);
}
// Blueprint list for the panel: owned first, then by rarity.
export function blueprintList(s) {
  return BP_ITEMS.map((id) => ({ id, item: ITEMS[id], owned: hasBlueprint(s, id), recipe: recipeOf(id) }))
    .sort((a, b) => (b.owned - a.owned) || QUALITY[a.item.q].rank - QUALITY[b.item.q].rank);
}
