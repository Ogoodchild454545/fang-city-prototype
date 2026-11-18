// Operator character sheet: paper doll (12 slots), stash grid, live stat panel with gear diff,
// tooltips + compare, tap or drag to equip, and the ability / skill panel with level unlocks.
// Opened by tapping an operator (Crew column, Operators screen). Rules live in core/items.js.
import { HEROES, defOf, classOf, speciesPerk } from '../core/heroes.js';
import {
  SLOTS, SLOT_BY_ID, ITEMS, QUALITY, STAT_DEFS, statsFor, stashList, ensureItems, equipItem, unequipItem,
  targetSlot, slotFits, modsOf, equippedIds, itemIcon, sourceText, hasBlueprint,
  SLOT_UNLOCK, slotOpen, slotLevel, openSlotCount, bestGear, BEST_GEAR_LV,
} from '../core/items.js';
import { isUnlocked, unlockLv, playerLv } from '../core/progression.js';
import { baseCarry, KIT, medCarry } from '../core/loadout.js';
import { perkMods, rankName, xpToNext, PERKS, MAX_LV } from '../core/progress.js';
import { esc } from './fmt.js';
import * as Audio from './audio.js';
import { abilityIcon } from './tactics.js';

// v0.11: painted item icons (assets/items/{id}.webp), framed by rarity. No emoji for items.
export const itemImg = (id, cls = '') => `<img class="iimg ${cls}" src="${itemIcon(id)}" alt="" draggable="false" loading="lazy">`;
// Empty slots show a faded silhouette of a typical piece for that slot.
const GHOST = { primary: 'carbine', melee: 'tyreiron', head: 'flatcap', jacket: 'hoodie', body: 'gilet', gloves: 'fingerless', boots: 'workboots', acc1: 'watch', acc2: 'ring', utility: 'pipebomb', consumable: 'dressings', trinket: 'dice' };
const icoOf = (id) => itemImg(id);

function cs(ctx) {
  ctx.sub.char ||= { hero: 'rook', tab: 'gear', sel: null, filter: null, back: 'crew' };
  return ctx.sub.char;
}

// Everything the sheet shows for a given equip map (so a preview can be diffed against now).
function sheet(s, id, equip) {
  const rec = s.heroes.owned[id] || {};
  const st = statsFor(id, { stars: rec.stars, lv: rec.lv, perks: rec.perks, gear: rec.gear, equip });
  const ids = Object.values(equip || {});
  const carry = baseCarry(id, equip) + perkMods(rec.perks).carry + (rec.gear === 'pouch' ? 2 : 0) + modsOf(ids).carry;
  const med = medCarry(s, id) - modsOf(equippedIds(rec)).medCarry + modsOf(ids).medCarry;
  return { ...st, carry, medCarry: med, crit: st.crit + 8 };
}

function previewEquipMap(s, c) {
  const rec = s.heroes.owned[c.hero];
  const sel = c.sel;
  if (!sel) return null;
  const eq = { ...(rec.equip || {}) };
  if (sel.from === 'stash') { const sl = sel.slot || targetSlot(rec, sel.id, s, c.hero); if (!sl) return null; eq[sl] = sel.id; return eq; }
  if (sel.from === 'slot' && eq[sel.slot]) { delete eq[sel.slot]; return eq; }
  return null;
}

const fmtStat = (d, v) => d.pct ? `${v}%` : `${v}`;

function statPanel(s, c) {
  const rec = s.heroes.owned[c.hero];
  const now = sheet(s, c.hero, rec.equip || {});
  const pe = previewEquipMap(s, c);
  const nx = pe ? sheet(s, c.hero, pe) : null;
  const row = (d) => {
    const v = now[d.id];
    const dv = nx ? nx[d.id] - v : 0;
    return `<div class="srow" title="${esc(d.tip || d.name)}"><span>${esc(d.short)}</span><b>${fmtStat(d, v)}</b>${dv ? `<em class="${dv > 0 ? 'up' : 'dn'}">${dv > 0 ? '▲' : '▼'}${Math.abs(dv)}</em>` : '<em></em>'}</div>`;
  };
  const wline = (label, w, add, w2, add2) => {
    const txt = (x, a) => x ? `${esc(x.name)} ${x.dmg[0] + a}–${x.dmg[1] + a}${x.typ !== 'melee' ? ` · r${x.range}` : ''}` : '—';
    const a = txt(w, add), b = nx ? txt(w2, add2) : a;
    return `<div class="wrow"><span>${label}</span><b>${a}</b>${b !== a ? `<em class="chg">→ ${b}</em>` : ''}</div>`;
  };
  return `<div class="cstats">
    <div class="sect">Stats${nx ? ' <span class="tiny dim" style="text-transform:none;letter-spacing:0">· preview</span>' : ''}</div>
    ${wline('Melee', now.mel, now.mdmg, nx && nx.mel, nx && nx.mdmg)}
    ${wline('Gun', now.gun, now.rdmg, nx && nx.gun, nx && nx.rdmg)}
    <div class="sgrid">${STAT_DEFS.map(row).join('')}</div>
    ${rec.gear && KIT[rec.gear] ? `<div class="tiny dim" style="margin-top:3px">Workshop mod: <b>${esc(KIT[rec.gear].name)}</b> (${esc(KIT[rec.gear].blurb)}) — set in Loadout</div>` : ''}
  </div>`;
}

function itemLines(it) {
  const out = [];
  if (it.wpn) out.push(`${it.wpn.dmg[0]}–${it.wpn.dmg[1]} dmg${it.wpn.typ !== 'melee' ? ` · range ${it.wpn.range} · ${it.wpn.typ}` : ' · melee'}`);
  for (const d of STAT_DEFS) if (it[d.id]) out.push(`${it[d.id] > 0 ? '+' : ''}${it[d.id]}${d.pct ? '%' : ''} ${d.name}`);
  if (it.charges) out.push(`${it.charges}× throw per fight`);
  return out;
}

export function itemCard(id, extra = '', s = null) {
  const it = ITEMS[id]; if (!it) return '';
  const q = QUALITY[it.q];
  const slot = SLOTS.find((x) => x.kind === it.slot);
  const bp = s && it.bp ? (hasBlueprint(s, id) ? ' · <span class="green">Blueprint owned</span>' : '') : '';
  return `<div class="icard q-${it.q}"><div class="ihead"><span class="iframe q-${it.q}">${itemImg(id)}</span><div><b style="color:${q.col}">${esc(it.name)}</b>
      <div class="tiny"><span class="rar q-${it.q}">${esc(q.name)}</span> <span class="dim">${esc(slot ? slot.name : it.slot)} · Lv ${it.lv}</span></div></div></div>
    <ul class="ilines">${itemLines(it).map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
    <div class="tiny dim iflav">“${esc(it.text || '')}”</div>
    <div class="tiny isrc">${esc(sourceText(id))}${bp}</div>${extra}</div>`;
}

// Stat-by-stat comparison of a stash item against what is in the slot now.
const CMP_KEYS = ['dmg', 'range', ...STAT_DEFS.map((d) => d.id), 'charges'];
function cmpVal(it, k) {
  if (!it) return 0;
  if (k === 'dmg') return it.wpn ? (it.wpn.dmg[0] + it.wpn.dmg[1]) / 2 : 0;
  if (k === 'range') return it.wpn && it.wpn.typ !== 'melee' ? it.wpn.range : 0;
  return it[k] || 0;
}
function compareTable(newId, curId) {
  const a = ITEMS[newId], b = curId ? ITEMS[curId] : null;
  const name = (k) => k === 'dmg' ? 'Avg damage' : k === 'range' ? 'Range' : k === 'charges' ? 'Throws' : (STAT_DEFS.find((d) => d.id === k) || {}).name;
  const rows = CMP_KEYS.map((k) => ({ k, n: cmpVal(a, k), c: cmpVal(b, k) })).filter((r) => r.n || r.c);
  if (!rows.length) return '';
  return `<table class="cmpt"><tr><th></th><th>${b ? esc(b.name) : 'Empty'}</th><th>New</th></tr>${rows.map((r) => {
    const d = r.n - r.c;
    return `<tr><td>${esc(name(r.k))}</td><td>${r.c}</td><td class="${d > 0 ? 'up' : d < 0 ? 'dn' : ''}">${r.n}${d ? ` ${d > 0 ? '▲' : '▼'}${Math.abs(Math.round(d * 10) / 10)}` : ''}</td></tr>`;
  }).join('')}</table>`;
}

function detail(s, c) {
  const rec = s.heroes.owned[c.hero];
  const sel = c.sel;
  if (!sel) {
    return `<div class="cdetail empty tiny dim">Tap a slot or an item to inspect and compare. ${matchMedia('(hover:hover)').matches ? 'Drag items onto slots to equip, or back to the stash to take them off.' : 'Tap Equip to put it on.'}</div>`;
  }
  if (sel.from === 'slot') {
    const id = rec.equip[sel.slot];
    if (!id) return `<div class="cdetail tiny dim"><b class="h small">${esc(SLOT_BY_ID[sel.slot].name)}</b> — empty. Matching items in your stash are highlighted.</div>`;
    return `<div class="cdetail">${itemCard(id, `<div class="row" style="margin-top:4px;gap:4px"><button class="btn sm" data-act="charUnequip" data-slot="${sel.slot}">Take off</button></div>`, s)}</div>`;
  }
  const it = ITEMS[sel.id];
  const fits = SLOTS.filter((sl) => sl.kind === it.slot && slotOpen(s, c.hero, sl.id));
  const tgt = sel.slot || targetSlot(rec, sel.id, s, c.hero);
  if (!fits.length) return `<div class="cdetail">${itemCard(sel.id, `<div class="tiny cmp red">🔒 ${esc(SLOT_BY_ID[tgt].name)} slot opens at level ${SLOT_UNLOCK[tgt]}.</div>`, s)}</div>`;
  const cur = rec.equip[tgt];
  if (slotLevel(s, c.hero) < it.lv) return `<div class="cdetail">${itemCard(sel.id, `${compareTable(sel.id, cur)}<div class="tiny cmp red">🔒 Needs level ${it.lv} (${esc(HEROES[c.hero].name)} or your player level).</div>`, s)}</div>`;
  const btns = fits.length > 1
    ? fits.map((sl) => `<button class="btn sm ${sl.id === tgt ? 'gold' : ''}" data-act="charEquip" data-id="${sel.id}" data-slot="${sl.id}">Equip · ${esc(sl.short)} ${sl.id.slice(-1)}</button>`).join('')
    : `<button class="btn sm gold" data-act="charEquip" data-id="${sel.id}" data-slot="${tgt}">Equip</button>`;
  const vs = (cur ? `<div class="tiny cmp">Replaces <b style="color:${QUALITY[ITEMS[cur].q].col}">${esc(ITEMS[cur].name)}</b></div>` : `<div class="tiny cmp green">${esc(SLOT_BY_ID[tgt].name)} slot is empty.</div>`) + compareTable(sel.id, cur);
  return `<div class="cdetail">${itemCard(sel.id, `${vs}<div class="row" style="margin-top:4px;gap:4px;flex-wrap:wrap">${btns}</div>`, s)}</div>`;
}

function slotBtn(s, rec, c, sl) {
  const id = (rec.equip || {})[sl.id];
  if (!slotOpen(s, c.hero, sl.id) && !id) {
    return `<button class="cslot locked" data-act="charSlotLocked" data-slot="${sl.id}" title="${esc(sl.name)}: opens at level ${SLOT_UNLOCK[sl.id]}">
      <span class="sico"><i>🔒</i></span><span class="slab">Lv ${SLOT_UNLOCK[sl.id]}</span></button>`;
  }
  const it = id && ITEMS[id];
  const selItem = c.sel && c.sel.from === 'stash' ? ITEMS[c.sel.id] : null;
  const fit = selItem && selItem.slot === sl.kind;
  const sel = c.sel && c.sel.from === 'slot' && c.sel.slot === sl.id;
  return `<button class="cslot ${it ? 'has q-' + it.q : 'empty'} ${fit ? 'fit' : ''} ${sel ? 'sel' : ''}" data-act="charSlot" data-slot="${sl.id}" data-drop-slot="${sl.id}" ${it ? `draggable="true" data-drag-slot="${sl.id}" data-tip-item="${id}"` : ''} title="${esc(it ? it.name : sl.name)}">
    <span class="sico">${it ? icoOf(id) : itemImg(GHOST[sl.id], 'ghost')}</span><span class="slab">${esc(it ? it.name : sl.short)}</span></button>`;
}

function bestBtn(s, c) {
  if (playerLv(s) >= BEST_GEAR_LV) return '<button class="btn sm gold" data-act="charBest" title="Equip the strongest gear you own in every open slot">✨ Best gear</button>';
  return `<button class="btn sm off" data-act="charBestLocked" title="Unlocks at player level ${BEST_GEAR_LV}">✨ Best gear · Lv ${BEST_GEAR_LV}</button>`;
}

function stashGrid(s, c) {
  const rec = s.heroes.owned[c.hero];
  let list = stashList(s);
  const kinds = [...new Set(SLOTS.map((x) => x.kind))];
  if (c.filter) list = list.filter((x) => x.item.slot === c.filter);
  const chips = `<div class="sfilt"><button class="chip ${!c.filter ? 'on' : ''}" data-act="charFilter" data-k="">All</button>${kinds.map((k) => `<button class="chip ${c.filter === k ? 'on' : ''}" data-act="charFilter" data-k="${k}">${esc(SLOTS.find((x) => x.kind === k).short)}</button>`).join('')}</div>`;
  const selSlotKind = c.sel && c.sel.from === 'slot' ? SLOT_BY_ID[c.sel.slot].kind : null;
  return `<div class="cstash" data-drop-stash="1">
    <div class="stashhead"><div class="sect" style="margin:0">Stash</div><span class="tiny dim">${list.reduce((a, x) => a + x.n, 0)} items · ${s.parts || 0} parts</span>
      ${bestBtn(s, c)}
</div>
    ${chips}
    <div class="sgridi">${list.length ? list.map(({ id, n, item }) => `<button class="sitem q-${item.q} ${c.sel && c.sel.from === 'stash' && c.sel.id === id ? 'sel' : ''} ${selSlotKind && item.slot === selSlotKind ? 'fit' : ''}" data-act="charItem" data-id="${id}" draggable="true" data-drag-item="${id}" data-tip-item="${id}" title="${esc(item.name)}">
        <span class="sico">${icoOf(id)}</span>${n > 1 ? `<span class="sn">×${n}</span>` : ''}<span class="slab">${esc(item.name)}</span></button>`).join('') : '<div class="tiny dim" style="padding:6px">Nothing here. Win ops, open crates, level up or craft at the Factory.</div>'}</div>
  </div>`;
}

function abilityPanel(s, c) {
  const d = defOf(c.hero), rec = s.heroes.owned[c.hero];
  const lv = Math.max(rec.lv || 1, playerLv(s)); // abilities open at operator OR player level
  const pk = speciesPerk(d.species);
  const ab = (a) => {
    const locked = a.unlock && lv < a.unlock;
    const nums = [`${a.ap} AP`, a.cd ? `${a.cd}-turn cooldown` : 'no cooldown'];
    if (a.range && a.kind !== 'melee') nums.push(`range ${a.range}`);
    if (a.dmgAdd) nums.push(`+${a.dmgAdd} dmg`);
    if (a.aim) nums.push(`+${a.aim} aim`);
    if (a.bleed) nums.push(`bleed ${a.bleed} turns`);
    if (a.heal) nums.push(`heal ${Math.round(a.heal * 100)}%`);
    if (a.radius) nums.push(`radius ${a.radius}`);
    return `<div class="abil ${locked ? 'locked' : ''}"><span class="aico">${abilityIcon(a.kind)}</span>
      <div><b class="h small">${esc(a.name)}</b> ${locked ? `<span class="tiny red">🔒 Unlocks at level ${a.unlock}</span>` : a.unlock ? '<span class="tiny green">Unlocked</span>' : '<span class="tiny dim">Basic</span>'}
      <div class="tiny">${esc(a.text)}</div><div class="tiny gold">${nums.join(' · ')}</div></div></div>`;
  };
  const perks = (rec.perks || []).map((p) => PERKS[p]?.name).filter(Boolean);
  return `<div class="cabil">
    <div class="sect" style="margin-top:0">Passive</div>
    <div class="abil"><span class="aico">${d.species === 'Wolf' ? '🐺' : abilityIcon(d.passive?.id === 'bulwark' ? 'fortify' : 'melee')}</span><div><b class="h small">${esc(d.passive?.name || '')}</b><div class="tiny">${esc(d.passive?.text || '')}</div>${pk ? `<div class="tiny dim">${esc(pk.name)} (${esc(d.species)}): ${esc(pk.text)}</div>` : ''}</div></div>
    <div class="sect">Abilities <span class="tiny dim" style="text-transform:none;letter-spacing:0">· level up with XP from fights to unlock more</span></div>
    ${(d.abilities || []).map(ab).join('')}
    <div class="tiny dim" style="margin-top:4px">Perks: ${perks.length ? esc(perks.join(', ')) : 'none yet'} · a perk pick at levels 3, 5, 7 and 10.</div>
  </div>`;
}

export function render(ctx) {
  const s = ctx.state, c = cs(ctx);
  ensureItems(s);
  if (!s.heroes.owned[c.hero]) c.hero = Object.keys(s.heroes.owned)[0] || 'rook';
  const rec = s.heroes.owned[c.hero], d = HEROES[c.hero];
  const lv = rec.lv || 1, need = xpToNext(lv);
  const pct = need ? Math.min(100, ((rec.xp || 0) / need) * 100) : 100;
  const L = SLOTS.filter((x) => ['head', 'jacket', 'body', 'gloves', 'boots', 'consumable'].includes(x.id));
  const R = SLOTS.filter((x) => ['primary', 'melee', 'acc1', 'acc2', 'utility', 'trinket'].includes(x.id));
  const owned = Object.keys(s.heroes.owned);
  return `<div class="charscr">
    <div class="charhead">
      <button class="btn sm" data-act="charBack">‹ Back</button>
      <div class="cname"><b class="h">${esc(d.name)}</b> <span class="tiny dim">${esc(d.species)} · ${esc((classOf(d) || {}).name || d.role)} · Lv ${lv} ${esc(rankName(lv))}</span>
        <div class="xpbar" title="XP"><i style="width:${pct}%"></i></div><span class="tiny dim">${need ? `${rec.xp || 0}/${need} XP` : 'Max level'} · ${openSlotCount(s, c.hero)}/${SLOTS.length} slots open</span></div>
      ${owned.length > 1 ? `<select class="csel" data-act="charHero">${owned.map((id) => `<option value="${id}" ${id === c.hero ? 'selected' : ''}>${esc(HEROES[id].name)}</option>`).join('')}</select>` : ''}
      <div class="ctabs"><button class="chip ${c.tab === 'gear' ? 'on' : ''}" data-act="charTab" data-t="gear">Inventory</button><button class="chip ${c.tab === 'skills' ? 'on' : ''}" data-act="charTab" data-t="skills">Abilities</button></div>
    </div>
    <div class="charbody">
      <div class="doll">
        <div class="dcol">${L.map((x) => slotBtn(s, rec, c, x)).join('')}</div>
        <div class="dpor"><img src="${d.portrait}" alt="${esc(d.name)}"><div class="dcls tiny">${esc((classOf(d) || {}).blurb || '')}</div></div>
        <div class="dcol">${R.map((x) => slotBtn(s, rec, c, x)).join('')}</div>
      </div>
      ${statPanel(s, c)}
      <div class="cright">${c.tab === 'skills' ? abilityPanel(s, c) : detail(s, c) + stashGrid(s, c)}</div>
    </div>
    <div class="ctip" id="ctip" hidden></div>
  </div>`;
}

// Desktop: drag items between stash and slots, and a hover tooltip with the item card.
export function mount(ctx, el) {
  const s = ctx.state, c = cs(ctx);
  let drag = null;
  el.querySelectorAll('[draggable="true"]').forEach((n) => n.addEventListener('dragstart', (e) => {
    drag = { item: n.dataset.dragItem || null, slot: n.dataset.dragSlot || null };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify(drag));
    tip(null);
  }));
  el.querySelectorAll('[data-drop-slot]').forEach((n) => {
    n.addEventListener('dragover', (e) => { if (drag && drag.item && slotFits(n.dataset.dropSlot, drag.item)) { e.preventDefault(); n.classList.add('over'); } });
    n.addEventListener('dragleave', () => n.classList.remove('over'));
    n.addEventListener('drop', (e) => { e.preventDefault(); if (drag && drag.item) doEquip(ctx, drag.item, n.dataset.dropSlot); drag = null; });
  });
  const st = el.querySelector('[data-drop-stash]');
  if (st) {
    st.addEventListener('dragover', (e) => { if (drag && drag.slot) { e.preventDefault(); st.classList.add('over'); } });
    st.addEventListener('dragleave', () => st.classList.remove('over'));
    st.addEventListener('drop', (e) => { e.preventDefault(); if (drag && drag.slot) doUnequip(ctx, drag.slot); drag = null; });
  }
  const tipEl = el.querySelector('#ctip');
  function tip(n, ev) {
    if (!tipEl) return;
    if (!n) { tipEl.hidden = true; return; }
    tipEl.innerHTML = itemCard(n.dataset.tipItem);
    tipEl.hidden = false;
    const r = el.getBoundingClientRect();
    const x = Math.min(ev.clientX - r.left + 14, r.width - 230), y = Math.min(ev.clientY - r.top + 14, r.height - tipEl.offsetHeight - 6);
    tipEl.style.left = Math.max(4, x) + 'px'; tipEl.style.top = Math.max(4, y) + 'px';
  }
  if (matchMedia('(hover:hover)').matches) {
    el.querySelectorAll('[data-tip-item]').forEach((n) => {
      n.addEventListener('mousemove', (e) => tip(n, e));
      n.addEventListener('mouseleave', () => tip(null));
    });
  }
}

function doEquip(ctx, id, slot) {
  const c = cs(ctx);
  const r = equipItem(ctx.state, c.hero, id, slot);
  if (!r.ok) return ctx.toast(r.reason);
  Audio.play('build');
  c.sel = null;
  ctx.save(); ctx.render();
}
function doUnequip(ctx, slot) {
  const c = cs(ctx);
  const r = unequipItem(ctx.state, c.hero, slot);
  if (!r.ok) return ctx.toast(r.reason);
  Audio.play('tap');
  c.sel = null;
  ctx.save(); ctx.render();
}

export function openCharacter(ctx, id) {
  const c = cs(ctx);
  c.hero = id || 'rook'; c.sel = null; c.filter = null;
  if (ctx.tab !== 'hero') c.back = ctx.tab;
  ctx.go('hero');
}

export const actions = {
  charBack(ctx) { const c = cs(ctx); ctx.go(c.back && c.back !== 'hero' ? c.back : 'crew'); },
  charTab(ctx, el) { cs(ctx).tab = el.dataset.t; ctx.render(); },
  charHero(ctx, el) { const c = cs(ctx); c.hero = el.value; c.sel = null; ctx.render(); },
  charFilter(ctx, el) { cs(ctx).filter = el.dataset.k || null; ctx.render(); },
  charSlot(ctx, el) {
    const c = cs(ctx), slot = el.dataset.slot;
    // A stash item is selected and fits: tapping the slot equips it there.
    if (c.sel && c.sel.from === 'stash' && slotFits(slot, c.sel.id)) return doEquip(ctx, c.sel.id, slot);
    if (c.sel && c.sel.from === 'slot' && c.sel.slot === slot) { c.sel = null; c.filter = null; return ctx.render(); }
    c.sel = { from: 'slot', slot };
    c.filter = SLOT_BY_ID[slot].kind;
    c.tab = 'gear';
    ctx.render();
  },
  charItem(ctx, el) {
    const c = cs(ctx), id = el.dataset.id;
    if (c.sel && c.sel.from === 'stash' && c.sel.id === id) { c.sel = null; return ctx.render(); }
    // A slot is selected and this item fits it: equip straight in.
    if (c.sel && c.sel.from === 'slot' && slotFits(c.sel.slot, id)) return doEquip(ctx, id, c.sel.slot);
    c.sel = { from: 'stash', id };
    ctx.render();
  },
  charEquip(ctx, el) { doEquip(ctx, el.dataset.id, el.dataset.slot); },
  charSlotLocked(ctx, el) { const sl = el.dataset.slot; ctx.toast(`${SLOT_BY_ID[sl].name} slot opens when ${HEROES[cs(ctx).hero].name} or your player level reaches ${SLOT_UNLOCK[sl]}`); },
  charBestLocked(ctx) { ctx.toast(`Best gear unlocks at player level ${BEST_GEAR_LV}`); },
  charBest(ctx) {
    const c = cs(ctx);
    const r = bestGear(ctx.state, c.hero);
    if (!r.ok) return ctx.toast(r.reason);
    Audio.play('build');
    c.sel = null;
    ctx.toast(r.changed ? `Best gear on: ${r.changed} slot${r.changed > 1 ? 's' : ''} changed` : 'Already wearing the best you have');
    ctx.save(); ctx.render();
  },
  charUnequip(ctx, el) { doUnequip(ctx, el.dataset.slot); },
};
