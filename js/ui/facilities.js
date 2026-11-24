// v0.11 base facilities: the Clinic and the Factory are buildings. Build one in the Hideout,
// tap it, and its panel opens (no separate menu anywhere else).
import { ITEMS, QUALITY, STAT_DEFS } from '../core/items.js';
import * as P from '../core/progression.js';
import * as FX from '../core/factory.js';
import { HEROES } from '../core/heroes.js';
import { money, dur, esc, ico } from './fmt.js';
import { itemImg, itemCard } from './character.js';
import * as Audio from './audio.js';

const left = (end, now) => `<span data-until="${end}">${dur(Math.max(0, (end - now) / 1000))}</span>`;
const st = (ctx) => (ctx.sub.fac ||= { pick: null });

// ---------------------------------------------------------------- Clinic
function clinicHtml(ctx) {
  const s = ctx.state, now = ctx.now();
  P.tickClinic(s, now);
  const beds = P.clinicSlots(s);
  const bed = (i) => {
    const p = s.clinic.filter((x) => x.start <= now)[i];
    if (!p) return `<div class="bed empty"><div class="bedimg"></div><b class="tiny dim">Bed ${i + 1}</b><span class="tiny faint">Free</span></div>`;
    const h = HEROES[p.hero] || {};
    const pct = Math.min(100, ((now - p.start) / (p.end - p.start)) * 100);
    return `<div class="bed"><div class="bedimg"><img loading="lazy" decoding="async" src="${h.thumb || h.portrait}" alt=""></div><b class="small">${esc(h.name || p.hero)}</b>
      <div class="bar"><i style="width:${pct}%"></i></div><span class="tiny dim">Patching up · ${left(p.end, now)}</span>
      <button class="btn sm gold" data-act="rushPatient" data-id="${p.hero}">Rush · ${ico('teeth')} ${P.RUSH_ICE}</button></div>`;
  };
  const queue = s.clinic.filter((x) => x.start > now);
  return `<div class="facp clinicp"><div class="fachead"><img loading="lazy" decoding="async" src="assets/base/clinic.webp" alt=""><div><div class="h" style="font-size:22px">Clinic</div>
      <div class="tiny dim">${beds} beds · ${P.CLINIC_MIN} min per patient${beds < 3 ? ' · 3rd bed at Clinic level 4' : ''}</div></div></div>
    <div class="beds">${Array.from({ length: beds }, (_, i) => bed(i)).join('')}</div>
    ${queue.length ? `<div class="tiny" style="margin-top:6px">Waiting: ${queue.map((p) => `${esc(HEROES[p.hero]?.name || p.hero)} (${left(p.end, now)})`).join(', ')}</div>` : ''}
    <div class="tiny faint" style="margin-top:6px">Operators knocked out in ops or street fights come here and sit out ops until they are patched up.</div></div>`;
}
export function openClinic(ctx) { ctx.modal(clinicHtml(ctx), { cls: 'facmodal' }); }

// ---------------------------------------------------------------- Factory
function statBits(it) {
  const out = [];
  if (it.wpn) out.push(`${it.wpn.dmg[0]}–${it.wpn.dmg[1]} dmg${it.wpn.typ !== 'melee' ? ` · r${it.wpn.range}` : ''}`);
  for (const d of STAT_DEFS) if (it[d.id]) out.push(`${it[d.id] > 0 ? '+' : ''}${it[d.id]}${d.pct ? '%' : ''} ${d.short}`);
  return out.join(' · ');
}
function factoryHtml(ctx) {
  const s = ctx.state, now = ctx.now(), f = st(ctx);
  const job = FX.factoryJob(s, now);
  const list = FX.blueprintList(s);
  const owned = list.filter((x) => x.owned);
  if (!f.pick || !ITEMS[f.pick]) f.pick = (owned[0] || list[0]).id;
  const bench = job
    ? `<div class="bench"><span class="iframe q-${job.item.q}">${itemImg(job.id)}</span><div class="grow"><b style="color:${QUALITY[job.item.q].col}">${esc(job.item.name)}</b>
        <div class="bar"><i style="width:${Math.min(100, ((now - job.start) / (job.end - job.start)) * 100)}%"></i></div>
        <span class="tiny dim">${job.done ? '<span class="green">Ready to collect</span>' : `On the bench · ${left(job.end, now)}`}</span></div>
        ${job.done ? '<button class="btn red" data-act="fxCollect">Collect</button>' : `<button class="btn gold sm" data-act="fxRush">Finish · ${ico('teeth')} ${FX.rushIce(job.left)}</button>`}</div>`
    : '<div class="bench empty tiny dim">The bench is free. Pick a blueprint and craft.</div>';
  const card = (x) => `<button class="bpc q-${x.item.q} ${x.owned ? '' : 'nobp'} ${f.pick === x.id ? 'sel' : ''}" data-act="fxPick" data-id="${x.id}" title="${esc(x.item.name)}">
      <span class="iframe q-${x.item.q}">${itemImg(x.id)}</span>${x.owned ? '' : '<i class="bplock">🔒</i>'}<span class="slab">${esc(x.item.name)}</span></button>`;
  const pk = list.find((x) => x.id === f.pick);
  const r = pk.recipe;
  const can = FX.canCraft(s, pk.id, now);
  const have = (ok, txt) => `<span class="${ok ? '' : 'red'}">${txt}</span>`;
  const cost = `<div class="fxcost">${have((s.parts || 0) >= r.parts, `${itemImg('parts', 'mini')} ${r.parts} parts <span class="dim">(${s.parts || 0})</span>`)}
      ${have(s.cash >= r.cash, `${money(r.cash)}`)} <span class="dim">· ⏱ ${dur(r.min * 60)}</span></div>`;
  const btn = pk.owned
    ? `<button class="btn ${can.ok ? 'red' : 'off'} block" data-act="fxCraft" data-id="${pk.id}">${can.ok ? 'Craft' : esc(can.reason)}</button>`
    : '<div class="tiny red">No blueprint yet. Blueprints turn up in op loot, Rookie Track rewards and crates.</div>';
  return `<div class="facp factoryp"><div class="fachead"><img loading="lazy" decoding="async" src="assets/base/factory.webp" alt=""><div><div class="h" style="font-size:22px">Factory</div>
      <div class="tiny dim">${owned.length}/${list.length} blueprints · ${itemImg('blueprint', 'mini')} find more in op loot</div></div></div>
    ${bench}
    <div class="fxbody"><div class="bpgrid">${list.map(card).join('')}</div>
      <div class="fxprev"><div class="sect" style="margin-top:0">Preview</div>${itemCard(pk.id, '', s)}${cost}${btn}</div></div></div>`;
}
export function openFactory(ctx) { ctx.modal(factoryHtml(ctx), { cls: 'facmodal' }); }
const refreshFactory = (ctx) => { const el = document.querySelector('.facmodal .sheet'); if (el) el.innerHTML = '<button class="x" data-act="closeModal">✕</button>' + factoryHtml(ctx); };
const refreshClinic = (ctx) => { const el = document.querySelector('.facmodal .sheet'); if (el) el.innerHTML = '<button class="x" data-act="closeModal">✕</button>' + clinicHtml(ctx); };

// Hideout live tick: count down timers in an open panel; redraw when something finishes.
export function live(ctx, now) {
  const el = document.querySelector('.facmodal');
  if (!el) return;
  el.querySelectorAll('[data-until]').forEach((n) => { const v = dur(Math.max(0, (+n.dataset.until - now) / 1000)); if (n.textContent !== v) n.textContent = v; });
  const due = [...el.querySelectorAll('[data-until]')].some((n) => +n.dataset.until <= now && !n.dataset.fired);
  if (due) { el.querySelectorAll('[data-until]').forEach((n) => { n.dataset.fired = 1; }); if (el.querySelector('.factoryp')) refreshFactory(ctx); else refreshClinic(ctx); }
}

export const actions = {
  openClinic, openFactory,
  rushPatient(ctx, el) { const r = P.rushPatient(ctx.state, el.dataset.id, ctx.now()); if (!r.ok) return ctx.toast(r.reason); ctx.toast(`${HEROES[el.dataset.id].name} is patched up`); ctx.save(); refreshClinic(ctx); },
  fxPick(ctx, el) { st(ctx).pick = el.dataset.id; refreshFactory(ctx); },
  fxCraft(ctx, el) {
    const r = FX.startCraft(ctx.state, el.dataset.id, ctx.now());
    if (!r.ok) return ctx.toast(r.reason);
    Audio.play('build'); ctx.toast(`On the bench: ${ITEMS[r.id].name}`); ctx.save(); refreshFactory(ctx); ctx.live();
  },
  fxCollect(ctx) {
    const r = FX.collectCraft(ctx.state, ctx.now());
    if (!r.ok) return ctx.toast(r.reason);
    Audio.play('collect'); ctx.toast(`Crafted: ${r.item.name} (${QUALITY[r.item.q].name}) — in your stash`); ctx.save(); refreshFactory(ctx);
  },
  fxRush(ctx) {
    const r = FX.rushCraft(ctx.state, ctx.now());
    if (!r.ok) return ctx.toast(r.reason);
    Audio.play('collect'); ctx.toast(`Crafted: ${r.item.name} (${QUALITY[r.item.q].name}) — in your stash`); ctx.save(); refreshFactory(ctx); ctx.live();
  },
};
