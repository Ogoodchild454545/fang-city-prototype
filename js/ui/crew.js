// "My Crew" screen: hero operators only (a new crew has just Rook). Operator list on the left, the selected
// operator's showcase (portrait, stats, gear, abilities) on the right. Troop training, housing and the Armoury
// tab are dormant (v0.9.1): the code below (armyTab, trainCard, upgradesTab, troop actions) is kept so troop
// hiring can return from the base later — flip TROOPS_UI to true to bring it back. Rules live in core/crew.js.
import { playerLv, busyReason, isUnlocked } from '../core/progression.js';
import { SPECIES, ROLES, TROOPS, TROOP_ORDER, BOSSES, BOSS_ORDER, BOSS_SLOTS, DEPLOY_CAP, GEAR } from '../core/data.js';
import * as C from '../core/crew.js';
import * as BS from '../core/base.js';
import { fmt, money, dur, esc, ico } from './fmt.js';
import { HEROES, HERO_ORDER, classOf } from '../core/heroes.js';
import { statsFor, ensureItems, equippedIds, ITEMS, STAT_DEFS } from '../core/items.js';
import { abilityIcon } from './tactics.js';
import { rankName, xpToNext } from '../core/progress.js';

const img = (t) => SPECIES[TROOPS[t].species].img;
// Troop training / hiring UI is parked until hiring moves to the base. Data + rules stay live for old saves.
export const TROOPS_UI = false;

function bossSlot(ctx, id, i) {
  const s = ctx.state, now = ctx.now();
  if (!id) return `<div class="bslot locked"><div class="bpor" style="background-image:url(assets/turf/lineup.jpg)"></div><div class="bmeta"><b class="h small">Locked</b><span class="tiny faint">Den 6 · coming soon</span></div><span class="lockic">🔒</span></div>`;
  const d = BOSSES[id], own = s.bosses[id];
  const unlocked = C.bossUnlocked(s, id);
  const resting = own && own.restUntil > now;
  return `<div class="bslot ${own ? 'own' : unlocked ? 'avail' : 'locked'}" data-act="bossInfo" data-id="${id}">
    <div class="bpor" style="background-image:url(${d.img})">${own ? `<span class="blv">${own.lv}</span>` : ''}</div>
    <div class="bmeta"><b class="h small">${esc(d.name)}</b>
      <span class="tiny ${own ? 'gold' : 'dim'}">${d.skillName}</span>
      <span class="tiny ${resting ? 'red' : own ? 'green' : unlocked ? 'gold' : 'faint'}">${resting ? `Resting <span data-live-rest="${id}">${dur((own.restUntil - now) / 1000)}</span>` : own ? 'Ready' : unlocked ? `Hire · ${money(d.cost)}` : `Den ${d.den}`}</span></div>
    ${own || unlocked ? '' : '<span class="lockic">🔒</span>'}
  </div>`;
}

// Left column: your operators. A new crew has exactly one — Rook. Tap to open his character sheet.
function opSlot(ctx, id, on) {
  const s = ctx.state, d = HEROES[id], rec = s.heroes.owned[id];
  const st = statsFor(id, { stars: rec.stars, lv: rec.lv, perks: rec.perks, gear: rec.gear, equip: rec.equip || {} });
  const n = equippedIds(rec).length;
  return `<button class="bslot own opslot ${on ? 'sel' : ''}" data-act="${on ? 'openHero' : 'crewPick'}" data-id="${id}" title="${on ? `Open ${esc(d.name)}'s gear and abilities` : `Show ${esc(d.name)}`}">
    <div class="bpor" style="background-image:url(${d.thumb || d.portrait})"><span class="blv">${rec.lv || 1}</span></div>
    <div class="bmeta"><b class="h small">${esc(d.name)}</b>
      <span class="tiny gold">${esc(d.species)} · ${esc((classOf(d) || {}).name || d.role)} · ${esc(rankName(rec.lv || 1))}</span>
      <span class="tiny dim">HP ${st.hp} · ${st.mel ? esc(st.mel.name) : esc(st.gun ? st.gun.name : '')} · ${n} gear</span>
      ${rec.pendingPerk ? '<span class="tiny green">Perk ready</span>' : '<span class="tiny faint">Tap for inventory</span>'}</div>
  </button>`;
}

// Main panel: the selected operator, big. Tap the portrait or "Gear & abilities" for the full sheet.
function heroShow(ctx, id) {
  const s = ctx.state, d = HEROES[id], rec = s.heroes.owned[id];
  const st = statsFor(id, { stars: rec.stars, lv: rec.lv, perks: rec.perks, gear: rec.gear, equip: rec.equip || {} });
  const lv = rec.lv || 1;
  const need = xpToNext(lv), pct = need ? Math.min(100, ((rec.xp || 0) / need) * 100) : 100;
  const cls = classOf(d) || {};
  const show = ['hp', 'armor', 'aim', 'crit', 'dodge', 'move'];
  const stat = (k) => { const sd = STAT_DEFS.find((x) => x.id === k); return `<div class="hsst"><span>${esc(sd.short)}</span><b>${st[k] ?? 0}${sd.pct ? '%' : ''}</b></div>`; };
  const w = (x) => x ? `${esc(x.name)} <span class="dim">${x.dmg[0]}–${x.dmg[1]}</span>` : '<span class="faint">—</span>';
  const eq = equippedIds(rec).map((i) => ITEMS[i]).filter(Boolean);
  const armour = eq.filter((it) => ['head', 'jacket', 'body', 'gloves', 'boots'].includes(it.slot)).slice(0, 4).map((it) => esc(it.name));
  const abil = (d.abilities || []).filter((a) => a.unlock);
  const alv = Math.max(lv, playerLv(s));
  const busy = busyReason(s, id, ctx.now());
  return `<div class="heroshow">
    <button class="hsport" data-act="openHero" data-id="${id}" style="background-image:url(${d.portrait})" title="Open ${esc(d.name)}'s gear and abilities"><span class="hslv">Lv ${lv}</span></button>
    <div class="hsbody">
      <div class="hsname"><span class="h">${esc(d.name)}</span><span class="tiny gold">${esc(d.species)} · ${esc(cls.name || d.role)} · ${esc(rankName(lv))}</span></div>
      <div class="xpbar" title="Experience"><i style="width:${pct}%"></i></div>
      <div class="tiny dim">${need ? `${rec.xp || 0}/${need} XP to level ${lv + 1}` : 'Max rank'}${rec.pendingPerk ? ' · <span class="green">Perk ready</span>' : ''}</div>
      <div class="hsstats">${show.map(stat).join('')}</div>
      <div class="hsgear tiny"><div><span class="faint">Melee</span> ${w(st.mel)}</div><div><span class="faint">Gun</span> ${w(st.gun)}</div>
        <div class="dim">${armour.length ? armour.join(' · ') : 'No armour yet'}${eq.length ? ` · ${eq.length} items equipped` : ''}</div></div>
      <div class="hsabil">${abil.map((a) => `<span class="hsab ${alv < a.unlock ? 'locked' : ''}" title="${esc(a.name)}${alv < a.unlock ? ` · unlocks at level ${a.unlock}` : ''}">${abilityIcon(a.kind)}<em>${alv < a.unlock ? 'Lv ' + a.unlock : esc(a.name)}</em></span>`).join('')}</div>
      ${busy ? `<div class="tiny gold">${busy.kind === 'job' ? '💼' : '🏥'} ${esc(busy.text)}</div>` : ''}
      <div class="hsbtns">
        <button class="btn red" data-act="openHero" data-id="${id}">Gear &amp; abilities</button>
        ${s.heroes.tutorialDone ? `<button class="btn" data-act="nav" data-tab="missions">🎯 Ops</button>` : '<button class="btn gold" data-act="startTutorial">⚔ Street lesson</button>'}
        ${isUnlocked(s, 'pvpcopy') ? '<button class="btn" data-act="startStreet">⚔ PvP</button>' : ''}
      </div>
    </div>
  </div>`;
}

// Hero-only crew screen (v0.9.1).
function heroTab(ctx) {
  const s = ctx.state;
  ensureItems(s);
  const ops = HERO_ORDER.filter((id) => s.heroes.owned[id]);
  let sel = ctx.sub.crewHero;
  if (!ops.includes(sel)) sel = ops[0];
  const more = HERO_ORDER.filter((id) => !s.heroes.owned[id] && HEROES[id].unlock?.kind !== 'level').length;
  return `
  <div class="armyscr heroonly">
    <div class="bosscol crewcol"><div class="sect" style="margin-top:0">Operators ${ops.length}</div>
      ${ops.map((id) => opSlot(ctx, id, id === sel)).join('')}
      ${more ? `<button class="bslot locked" data-act="nav" data-tab="heroes"><div class="bpor" style="background-image:none">?</div><div class="bmeta"><b class="h small">Recruit</b><span class="tiny faint">${more} more with shards</span></div></button>` : ''}
      <div class="tiny faint" style="padding:4px 2px">Troops will be hired at the base later.</div>
    </div>
    <div class="armymain">${sel ? heroShow(ctx, sel) : '<div class="tiny dim">No operators.</div>'}</div>
  </div>`;
}

function troopChip(ctx, t, n) {
  const lv = C.troopLevel(ctx.state, t);
  return `<button class="tchip" data-act="troopInfo" data-t="${t}"><div class="tpor" style="background-image:url(${img(t)})"><span class="tn">x${n}</span><span class="tl">${lv}</span></div><span class="tiny">${TROOPS[t].name.split(' ')[1]}</span></button>`;
}

function armyTab(ctx) {
  const s = ctx.state, now = ctx.now();
  const cap = C.armyCap(s), used = C.armyUsed(s), q = C.queuedSpace(s);
  const yard = C.yardLevel(s);
  const troops = TROOP_ORDER.filter((t) => s.army[t] > 0);
  const line = C.lineup(s, now);
  const remain = C.queueRemaining(s, now);
  const skip = C.skipCostSec(remain);
  const head = s.queue[0];
  ensureItems(s);
  const ops = HERO_ORDER.filter((id) => s.heroes.owned[id]);
  return `
  <div class="armyscr">
    <div class="bosscol crewcol"><div class="sect" style="margin-top:0">Crew</div>${ops.map((id) => opSlot(ctx, id)).join('')}</div>
    <div class="armymain">
      <div class="armyhead">
        <div class="sect" style="margin:0;flex:1">Troops</div>
        <span class="house" title="housing space used / total">🏠 <b data-live="army">${used}</b>/${cap}${q ? `<span class="tiny dim"> +${q} queued</span>` : ''}</span>
        <button class="btn dim battlebtn" data-act="nav" data-tab="heroes">Operators</button>
        <button class="btn red battlebtn" data-act="goBattle" ${line.length ? '' : 'disabled'}>⚔ Battle</button>
      </div>
      <div class="troops">${troops.length ? troops.map((t) => troopChip(ctx, t, s.army[t])).join('') : '<div class="tiny dim" style="padding:8px">No troops yet. Train some below.</div>'}</div>
      <div class="tiny faint">Next fight: ${Math.min(DEPLOY_CAP, C.armyCount(s))} of ${C.armyCount(s)} troops${line.some((m) => m.boss) ? ' + ' + line.filter((m) => m.boss).map((m) => m.name).join(' & ') : ''} · power ${fmt(C.lineupPower(s, now))}. Troops knocked out in a fight are lost; survivors come home.</div>
      <div class="armyhead" style="margin-top:6px">
        <div class="sect" style="margin:0;flex:1">Training ${s.queue.length ? `(${s.queue.length})` : ''}</div>
        ${s.queue.length ? `<span class="tiny gold" data-live-q>${dur(remain)}</span><button class="btn sm gold" data-act="skipQueue">${skip ? (s.tickets > 0 ? '🎟️ Finish' : `Finish · ${ico('teeth')} ${skip}`) : 'Finish'}</button>` : ''}
      </div>
      <div class="queue">${s.queue.length ? s.queue.map((x, i) => `<button class="qchip ${i === 0 ? 'head' : ''}" data-act="unqueue" data-i="${i}"><div class="tpor sm" style="background-image:url(${img(x.t)})"></div>${i === 0 ? `<div class="qbar"><i data-live-qbar style="width:${Math.min(100, ((now - s.queueAt) / (x.dur * 1000)) * 100)}%"></i></div>` : ''}<span class="qx">✕</span></button>`).join('') : `<span class="tiny dim">${yard ? 'Queue empty. Tap a troop to train it.' : 'Build a Training Yard at the Hideout to train troops.'}</span>`}</div>
      <div class="sect">Train <span class="tiny dim" style="text-transform:none;letter-spacing:0">Training Yard lv ${yard || '-'}</span></div>
      <div class="trainrow">${TROOP_ORDER.map((t) => trainCard(ctx, t)).join('')}</div>
    </div>
  </div>`;
}

function trainCard(ctx, t) {
  const s = ctx.state, d = TROOPS[t];
  const ok = C.troopUnlocked(s, t);
  const cost = C.trainCost(s, t);
  const fits = C.armyUsed(s) + C.queuedSpace(s) + d.space <= C.armyCap(s);
  return `<button class="tcard ${ok ? '' : 'locked'} ${ok && (!fits || s.cash < cost) ? 'cant' : ''}" data-act="train" data-t="${t}">
    <div class="tpor" style="background-image:url(${img(t)})">${ok ? `<span class="tl">${C.troopLevel(s, t)}</span>` : '<span class="lockic">🔒</span>'}<span class="ti" data-act="troopInfo" data-t="${t}">i</span></div>
    <b class="tiny h">${d.name}</b>
    ${ok ? `<span class="tiny">${money(cost)}</span><span class="tiny dim">🏠${d.space} · ${dur(C.trainSeconds(s, t, ctx.now()))}</span>` : `<span class="tiny faint">Yard lv ${d.yard}</span>`}
  </button>`;
}

function upgradesTab(ctx) {
  const s = ctx.state, now = ctx.now();
  const arm = BS.armouryLevel(s);
  const r = s.research;
  const max = C.maxTroopLv(s);
  return `
  ${!arm ? `<div class="card"><b class="h">No Armoury yet</b><div class="tiny dim">Build an Armoury at the Hideout (unlocks at Den 2). It upgrades troop types: better weapons, armour and health for every troop of that type.</div><button class="btn sm" style="margin-top:6px" data-act="nav" data-tab="base">Go to the Hideout</button></div>` : ''}
  ${r ? `<div class="card glow"><div class="row"><div class="tpor sm" style="background-image:url(${img(r.t)})"></div><div class="grow"><b class="h small">Upgrading ${TROOPS[r.t].name} to lv ${C.troopLevel(s, r.t) + 1}</b><div class="tiny gold" data-live-res>${dur((r.endsAt - now) / 1000)}</div></div>
     <button class="btn sm gold" data-act="skipResearch">Finish · ${ico('teeth')} ${C.skipCostSec((r.endsAt - now) / 1000)}</button></div></div>` : ''}
  <div class="tiny dim" style="margin:0 2px 6px">Armoury lv ${arm || 0}: troops can reach level ${max}. One upgrade at a time, paid in Rep ${ico('influence')}.</div>
  <div class="grid2">${TROOP_ORDER.map((t) => {
    const lv = C.troopLevel(s, t), ok = C.troopUnlocked(s, t);
    const a = C.troopStats(t, lv), b = C.troopStats(t, Math.min(10, lv + 1));
    const cost = C.researchCost(t, lv);
    const can = ok && arm && !r && lv < max;
    return `<div class="card upg ${ok ? '' : 'lockedc'}"><div class="row"><div class="tpor sm" style="background-image:url(${img(t)})"><span class="tl">${lv}</span></div>
      <div class="grow"><b class="h small">${TROOPS[t].name}</b><div class="tiny dim">HP ${a.hp}${lv < 10 ? `→<span class="green">${b.hp}</span>` : ''} · ${a.weapon.name} ${a.weapon.dmg}${b.weapon.dmg !== a.weapon.dmg ? `→<span class="green">${b.weapon.dmg}</span>` : ''} dmg · DEF ${a.def}${b.def !== a.def ? `→<span class="green">${b.def}</span>` : ''}</div></div>
      ${!ok ? `<span class="pill">Yard ${TROOPS[t].yard}</span>` : lv >= 10 ? '<span class="pill">Max</span>' : `<button class="btn sm ${can && s.influence >= cost ? 'red' : ''}" data-act="research" data-t="${t}" ${can ? '' : 'disabled'}>${ico('influence')} ${fmt(cost)}<br><span class="tiny">${dur(C.researchSeconds(t, lv))}</span></button>`}</div></div>`;
  }).join('')}</div>`;
}

export function render(ctx) {
  if (!TROOPS_UI) return `
  <div class="tabs crewtabs">${[['army', 'My Crew'], ['ops', 'Operators']].map(([x, l]) => `<button class="${x === 'army' ? 'on' : ''}" data-act="crewTab" data-t="${x}">${l}</button>`).join('')}</div>
  ${heroTab(ctx)}`;
  const t = ctx.sub.crewTab || 'army';
  return `
  <div class="tabs crewtabs">${[['army', 'My Crew'], ['upgrades', 'Upgrades'], ['ops', 'Operators']].map(([x, l]) => `<button class="${t === x ? 'on' : ''}" data-act="crewTab" data-t="${x}">${l}</button>`).join('')}</div>
  ${t === 'ops' ? '<div class="tiny dim" style="padding:8px">Opening Operators…</div>' : t === 'army' ? armyTab(ctx) : upgradesTab(ctx)}`;
}

export function live(ctx, now) {
  const s = ctx.state;
  const q = document.querySelector('[data-live-q]');
  if (q) q.textContent = dur(C.queueRemaining(s, now));
  const bar = document.querySelector('[data-live-qbar]');
  if (bar && s.queue[0]) bar.style.width = Math.min(100, ((now - s.queueAt) / (s.queue[0].dur * 1000)) * 100) + '%';
  const r = document.querySelector('[data-live-res]');
  if (r && s.research) r.textContent = dur((s.research.endsAt - now) / 1000);
  document.querySelectorAll('[data-live-rest]').forEach((n) => { const b = s.bosses[n.dataset.liveRest]; if (b) n.textContent = dur((b.restUntil - now) / 1000); });
}

function troopModal(ctx, t) {
  const s = ctx.state, d = TROOPS[t];
  const lv = C.troopLevel(s, t), st = C.troopStats(t, lv);
  const sp = SPECIES[d.species];
  return `<div class="msheet"><div class="mleft"><div class="detail-hero"><div class="big" style="background-image:url(${img(t)})"></div>
    <div class="namebox"><div class="h" style="font-size:22px">${d.name}</div><div class="r">${ROLES[d.role].name}</div><div class="tiny dim">Level ${lv} · 🏠 ${d.space} space</div></div></div></div>
    <div class="mright">
      <div class="card"><b class="tiny red h">${sp.traitName}</b><div class="small">${sp.traitDesc}</div><div class="tiny dim" style="margin-top:4px">${d.blurb}</div></div>
      <div class="card"><table class="stats"><tr><td>Health</td><td>${st.hp}</td></tr><tr><td>Weapon</td><td>${st.weapon.name} · ${st.weapon.dmg} dmg · range ${st.weapon.range}</td></tr>
        <tr><td>Armour</td><td>DEF ${st.def}</td></tr><tr><td>Action points</td><td>${st.ap}</td></tr>${st.gadget ? `<tr><td>Gadget</td><td>${st.gadget.name}</td></tr>` : ''}
        <tr><td>Train</td><td>${money(C.trainCost(s, t))} · ${dur(C.trainSeconds(s, t, ctx.now()))}</td></tr><tr><td>Unlocks</td><td>Training Yard lv ${d.yard}</td></tr></table></div>
      ${C.troopUnlocked(s, t) ? `<button class="btn red block" data-act="train" data-t="${t}">Train one · ${money(C.trainCost(s, t))}</button>` : `<div class="tiny faint">Upgrade the Training Yard to level ${d.yard} to unlock.</div>`}
    </div></div>`;
}

function bossModal(ctx, id) {
  const s = ctx.state, d = BOSSES[id], own = s.bosses[id], now = ctx.now();
  const lv = own ? own.lv : 1;
  const st = C.bossFighter(id, lv).stats;
  const unlocked = C.bossUnlocked(s, id);
  const max = C.bossMaxLv(s);
  const cost = C.bossUpgradeCost(id, lv);
  return `<div class="msheet"><div class="mleft"><div class="detail-hero"><div class="big" style="background-image:url(${d.img});background-position:center 20%"></div>
    <div class="namebox"><div class="h" style="font-size:22px">${d.name}</div><div class="r">Boss · ${SPECIES[d.species].name}</div><div class="tiny dim">${own ? `Level ${lv}/${max}` : unlocked ? 'Ready to hire' : `Unlocks at Den ${d.den}`}</div></div></div></div>
    <div class="mright">
      <div class="card glow"><b class="tiny gold h">Skill: ${d.skillName}</b><div class="small">${d.skillDesc}</div></div>
      <div class="card"><table class="stats"><tr><td>Health</td><td>${st.hp}</td></tr><tr><td>Weapon</td><td>${st.weapon.name} · ${st.weapon.dmg} dmg · range ${st.weapon.range}</td></tr><tr><td>Armour</td><td>DEF ${st.def}</td></tr></table>
        <div class="tiny faint">Bosses join every fight on top of your troops. If knocked out they rest for 10 minutes; they are never lost.</div></div>
      ${!own ? (unlocked ? `<button class="btn red block" data-act="hireBoss" data-id="${id}">Hire ${d.name} · ${money(d.cost)}</button>` : `<div class="tiny faint">Upgrade The Den to level ${d.den} to unlock.</div>`)
        : `${own.restUntil > now ? `<button class="btn gold block" data-act="reviveBoss" data-id="${id}">Patch up now · ${ico('teeth')} ${C.skipCostSec((own.restUntil - now) / 1000)}</button>` : ''}
           ${lv < max ? `<button class="btn red block" style="margin-top:6px" data-act="upgradeBoss" data-id="${id}">Level up · ${ico('influence')} ${fmt(cost)}</button>` : `<div class="tiny faint">Max level for your Den. Upgrade The Den for more.</div>`}`}
    </div></div>`;
}

const reopen = (ctx, html) => { const el = document.querySelector('.overlay .sheet'); if (el) el.innerHTML = '<button class="x" data-act="closeModal">✕</button>' + html; };

export const actions = {
  crewPick(ctx, el) { ctx.sub.crewHero = el.dataset.id; ctx.render(); },
  crewTab(ctx, el) { if (el.dataset.t === 'ops') return ctx.go('heroes'); ctx.sub.crewTab = el.dataset.t; ctx.render(); },
  train(ctx, el, e) {
    e?.stopPropagation?.();
    const t = el.dataset.t;
    const r = C.enqueue(ctx.state, t, ctx.now());
    if (!r.ok) {
      const msg = { yard: 'Build a Training Yard at the Hideout first', locked: `${TROOPS[t].name} unlocks at Training Yard level ${TROOPS[t].yard}`, housing: 'Not enough housing. Build or upgrade Bunkhouses, or upgrade The Den.', cash: 'Not enough cash', queue: 'Queue is full' }[r.reason] || 'Cannot train';
      return ctx.toast(msg);
    }
    if (ctx.tab === 'crew') ctx.render();
    if (document.querySelector('.overlay')) reopen(ctx, troopModal(ctx, t));
  },
  unqueue(ctx, el) { C.unqueue(ctx.state, +el.dataset.i, ctx.now()); ctx.render(); },
  skipQueue(ctx) {
    const r = C.skipQueue(ctx.state, ctx.now());
    if (!r.ok) return ctx.toast(r.reason === 'teeth' ? 'Not enough Ice' : 'Nothing to finish');
    ctx.toast(`${r.done.length} troops ready${r.ticket ? ' (rush ticket used)' : r.cost ? ` for ${r.cost} Ice` : ''}`);
    ctx.render();
  },
  troopInfo(ctx, el, e) { e?.stopPropagation?.(); ctx.modal(troopModal(ctx, el.dataset.t), { cls: 'wide' }); },
  bossInfo(ctx, el) { ctx.modal(bossModal(ctx, el.dataset.id), { cls: 'wide' }); },
  hireBoss(ctx, el) {
    const id = el.dataset.id;
    const r = C.hireBoss(ctx.state, id);
    if (!r.ok) return ctx.toast(r.reason === 'cash' ? 'Not enough cash' : r.reason === 'den' ? `Needs Den level ${r.need}` : 'Cannot hire');
    ctx.toast(`${BOSSES[id].name} joins your crew`);
    ctx.closeModal(true); ctx.render();
  },
  upgradeBoss(ctx, el) {
    const id = el.dataset.id;
    const r = C.upgradeBoss(ctx.state, id);
    if (!r.ok) return ctx.toast(r.reason === 'influence' ? `Need ${fmt(r.cost)} Rep` : 'Max level for your Den');
    ctx.toast(`${BOSSES[id].name} is now level ${r.lv}`);
    reopen(ctx, bossModal(ctx, id)); ctx.render();
  },
  reviveBoss(ctx, el) {
    const r = C.reviveBoss(ctx.state, el.dataset.id, ctx.now());
    if (!r.ok) return ctx.toast('Not enough Ice');
    reopen(ctx, bossModal(ctx, el.dataset.id)); ctx.render();
  },
  research(ctx, el) {
    const t = el.dataset.t;
    const r = C.startResearch(ctx.state, t, ctx.now());
    if (!r.ok) return ctx.toast({ busy: 'The Armoury is already upgrading something', armoury: 'Build an Armoury first', influence: `Need ${fmt(r.cost || 0)} Rep`, max: 'Upgrade the Armoury for higher levels', locked: 'Unlock this troop first' }[r.reason] || 'Cannot upgrade');
    ctx.render();
  },
  skipResearch(ctx) {
    const r = C.skipResearch(ctx.state, ctx.now());
    if (!r.ok) return ctx.toast('Not enough Ice');
    ctx.toast(`${TROOPS[r.done.t].name} upgraded to level ${r.done.lv}`);
    ctx.render();
  },
  goBattle(ctx) { ctx.go('missions'); },
};
