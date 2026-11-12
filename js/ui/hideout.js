// Hideout: the free-build isometric base. Pan/zoom the wasteland, clear junk, place and upgrade buildings.
import { BUILDINGS, OBSTACLES, CATS, costOf, timeOf, rateOf, tillOf, storeOf, housingOf, turretOf, lvCap, spriteFor } from '../core/buildings.js';
import * as BS from '../core/base.js';
import * as E from '../core/economy.js';
import * as M from '../core/meta.js';
import * as C from '../core/crew.js';
import { TROOPS, TROOP_ORDER, BOSSES, BOSS_ORDER } from '../core/data.js';
import { BaseView, preload, tileToWorld } from './iso.js';
import { fmt, money, dur, esc, rewardText, resName, ico } from './fmt.js';

let view = null;
const ui = (ctx) => (ctx.sub.base ||= { sel: null, place: null, cam: null, cat: 'money' });
const resIcon = (r) => ico(r);
const price = (res, v) => (res === 'cash' ? money(v) : `${ico(res)} ${fmt(v)}`);
const afford = (s, res, v) => (s[res] || 0) >= v;

export function render(ctx) {
  const s = ctx.state, now = ctx.now();
  const obj = M.currentObjective(s);
  ctx.sub.objKey = obj ? `${obj.index}:${obj.done}` : 'none';
  const ad = E.adBoostActive(s, now);
  return `
  <div class="basewrap" id="basewrap">
    <canvas id="basecv"></canvas>
    <div class="hud hud-tl">
      <button class="pillbtn" data-act="builders"><span>🔨</span><b data-live="builders">${BS.buildersFree(s)}/${s.base.builders}</b><span class="tiny dim">builders</span></button>
      ${obj ? `<div class="objcard ${obj.done ? 'glow' : ''}" data-act="${obj.done ? 'claimObj' : 'objHint'}">
        <div class="tick">${obj.done ? '✔' : obj.index + 1}</div>
        <div class="grow"><div class="tiny red h">Boss's orders</div><div class="small">${obj.text}</div>
        <div class="tiny dim">${obj.done ? 'Tap to claim: ' : 'Reward: '}${rewardText(obj.reward)}</div></div></div>` : ''}
    </div>
    <div class="hud hud-tr">
      <button class="pillbtn ${ad ? 'gold' : ''}" data-act="adBoost">${ad ? `x2 cash · <span data-live="adleft"></span>` : '▶ x2 cash (ad)'}</button>
    </div>
    <div class="hud hud-bl">
      <button class="tapbtn sm" data-act="tap">Shake<br>down<small data-live="tapv">+${money(E.tapValue(s, now))}</small></button>
    </div>
    <div class="hud hud-br">
      <button class="bigbtn" data-act="openBuild"><span class="i">🔨</span>Build</button>
      <button class="bigbtn" data-act="nav" data-tab="shop"><span class="i">🧰</span>Shop</button>
    </div>
    <div class="hud hud-bc" id="selpanel"></div>
  </div>`;
}

export function mount(ctx, el) {
  const u = ui(ctx);
  view?.destroy();
  const cv = el.querySelector('#basecv');
  if (!u.cam) { const d = BS.den(ctx.state); const w = tileToWorld(d.x + 1.5, d.y + 1.5); u.cam = { x: w.x, y: w.y + 20, z: 0.62 }; }
  view = new BaseView(cv, {
    cam: u.cam,
    getState: () => ctx.state,
    now: () => ctx.now(),
    onTap: (hit) => onTap(ctx, hit),
    onGhostMove: (x, y) => { if (!u.place) return; u.place.x = x; u.place.y = y; syncGhost(ctx); panel(ctx); },
    bubble: (b) => bubbleFor(ctx, b),
  });
  view.sel = u.sel;
  syncGhost(ctx);
  preload(() => { view && (view.dirty = true); });
  panel(ctx);
  window.__base = {
    view,
    screenOf: (id) => { const it = BS.byId(ctx.state, id); if (!it) return null; const sz = (BUILDINGS[it.t] || OBSTACLES[it.t]).size; const p = view.centerOfFootprint(it.x, it.y, sz); const r = cv.getBoundingClientRect(); return { x: r.left + p.x, y: r.top + p.y }; },
    tileToClient: (i, j) => { const w = tileToWorld(i + 0.5, j + 0.5); const p = view.toScreen(w.x, w.y); const r = cv.getBoundingClientRect(); return { x: r.left + p.x, y: r.top + p.y }; },
    bubbles: () => { const r = cv.getBoundingClientRect(); return view.hitBubbles.map((b) => ({ id: b.id, x: r.left + b.x, y: r.top + b.y })); },
    centerOn: (id) => { const it = BS.byId(ctx.state, id); const sz = (BUILDINGS[it.t] || OBSTACLES[it.t]).size; view.centerOn(it.x, it.y, sz); view.draw(); },
  };
}

function bubbleFor(ctx, b) {
  const d = BUILDINGS[b.t];
  if (!d.produce || b.lv < 1 || BS.isAutoCollect(ctx.state, b, ctx.now())) return null;
  const cap = BS.tillCap(ctx.state, b, ctx.now());
  if (b.till < Math.max(1, cap * 0.03)) return null;
  const room = BS.caps(ctx.state)[d.produce.res] - ctx.state[d.produce.res];
  return { res: d.produce.res, full: room < 1 };
}

function syncGhost(ctx) {
  const u = ui(ctx);
  if (!view) return;
  if (u.place) {
    const p = u.place;
    view.ghost = { type: p.type, x: p.x, y: p.y, lv: p.moveId ? BS.byId(ctx.state, p.moveId)?.lv : 1, ok: BS.canPlace(ctx.state.base, p.type, p.x, p.y, p.moveId) };
    view.hidden = p.moveId || null;
  } else { view.ghost = null; view.hidden = null; }
  view.sel = u.sel;
  view.dirty = true;
}

function onTap(ctx, hit) {
  const u = ui(ctx), s = ctx.state;
  if (hit.kind === 'bubble') {
    const r = BS.collect(s, hit.id);
    if (r.ok) ctx.floaty(`+${r.res === 'cash' ? money(r.amount) : fmt(r.amount) + ' Rep'}`, hit.sx + cvLeft(), hit.sy + cvTop());
    else if (r.full) ctx.toast(`Storage full. Build or upgrade a ${r.res === 'cash' ? 'Strongbox' : 'Ledger Office'}.`);
    ctx.save(); ctx.live(); view.dirty = true; panel(ctx);
    return;
  }
  if (hit.kind === 'ghostTap') {
    const p = u.place, sz = BUILDINGS[p.type].size;
    p.x = Math.max(0, hit.i - Math.floor(sz / 2)); p.y = Math.max(0, hit.j - Math.floor(sz / 2));
    syncGhost(ctx); panel(ctx);
    return;
  }
  if (hit.kind === 'building' || hit.kind === 'obstacle') {
    u.sel = u.sel === hit.id && hit.kind === 'obstacle' ? null : hit.id;
    syncGhost(ctx); panel(ctx);
    return;
  }
  u.sel = null; syncGhost(ctx); panel(ctx);
}
const cvLeft = () => document.getElementById('basecv')?.getBoundingClientRect().left || 0;
const cvTop = () => document.getElementById('basecv')?.getBoundingClientRect().top || 0;

// ---------------------------------------------------------------- bottom panel
function panel(ctx) {
  const el = document.getElementById('selpanel');
  if (!el) return;
  el.innerHTML = panelHtml(ctx);
}
function panelHtml(ctx) {
  const u = ui(ctx), s = ctx.state, now = ctx.now();
  if (u.place) {
    const p = u.place, d = BUILDINGS[p.type];
    const ok = BS.canPlace(s.base, p.type, p.x, p.y, p.moveId);
    const cost = p.moveId ? '' : `${price(d.res, costOf(p.type, 1))}${timeOf(p.type, 1) ? ' · ' + dur(timeOf(p.type, 1)) : ' · instant'}`;
    return `<div class="selbar place">
      <div class="col grow"><b class="h">${p.moveId ? 'Move' : 'Place'} ${d.name}</b><span class="tiny ${ok ? 'green' : 'red'}">${ok ? 'Drag it where you want it' : 'Blocked: drag to clear ground'}${cost ? ' · ' + cost : ''}</span></div>
      <button class="round ok" data-act="placeOk" ${ok ? '' : 'disabled'}>✓</button>
      <button class="round no" data-act="placeCancel">✕</button></div>`;
  }
  const it = u.sel && BS.byId(s, u.sel);
  if (!it) { u.sel = null; return ''; }
  if (OBSTACLES[it.t] && !BUILDINGS[it.t]) return obstaclePanel(ctx, it, now);
  return buildingPanel(ctx, it, now);
}

function obstaclePanel(ctx, o, now) {
  const d = OBSTACLES[o.t], s = ctx.state;
  if (o.clr) {
    const c = BS.speedUpCost(o, now);
    return `<div class="selbar"><div class="col grow"><b class="h">${d.name}</b><span class="tiny dim">Clearing · <span data-live="jobleft">${dur((o.clr.endsAt - now) / 1000)}</span></span></div>
      <button class="act2 gold" data-act="speed" data-id="${o.id}"><span class="i">⚡</span>Finish<span class="c" data-live="speedc">${ico('teeth')} ${c}</span></button></div>`;
  }
  return `<div class="selbar"><div class="col grow"><b class="h">${d.name}</b><span class="tiny dim">Clear it to free ${d.size * d.size} tile${d.size > 1 ? 's' : ''}. Takes ${dur(d.time)}, needs a builder. Sometimes hides Ice.</span></div>
    <button class="act2 ${afford(s, 'cash', d.cost) && BS.buildersFree(s) > 0 ? 'red' : 'off'}" data-act="clearO" data-id="${o.id}"><span class="i">🪓</span>Clear<span class="c">${money(d.cost)}</span></button></div>`;
}

function statLine(ctx, b) {
  const d = BUILDINGS[b.t], s = ctx.state, now = ctx.now();
  const lv = Math.max(1, b.lv);
  if (d.produce) {
    const r = BS.rate(s, b, now);
    const per = d.produce.res === 'cash' ? `${money(r)}/s` : `${ico('influence')} ${fmt(r * 3600)}/h`;
    return `${per} · holds ${d.produce.res === 'cash' ? money(BS.tillCap(s, b, now)) : ico('influence') + ' ' + fmt(BS.tillCap(s, b, now))}${BS.isAutoCollect(s, b, now) ? ' · <span class="green">auto-collect</span>' : ''}`;
  }
  if (b.t === 'den') return `Stores ${money(storeOf('den', lv, 'cash'))} + ${ico('influence')} ${fmt(storeOf('den', lv, 'influence'))} Rep · houses ${housingOf('den', lv)} troop space · max building level ${lvCap('stall', lv)}`;
  if (d.store) return `Stores ${d.store.cash ? money(storeOf(b.t, lv, 'cash')) : ico('influence') + ' ' + fmt(storeOf(b.t, lv, 'influence')) + ' Rep'}`;
  if (d.housing) return `Houses ${housingOf(b.t, lv)} troop space · army ${C.armyUsed(s)}/${C.armyCap(s)}`;
  if (d.turret) { const t = turretOf(b.t, lv); return `Turret in raids: ${t.dmg} dmg · range ${t.range} · ${t.hp} HP`; }
  if (b.t === 'gym') { const nx = TROOP_ORDER.find((t) => TROOPS[t].yard > lv); return `Trains ${TROOP_ORDER.filter((t) => TROOPS[t].yard <= lv).length} troop types · ${Math.round(5 * (lv - 1))}% faster${nx ? ` · lv ${TROOPS[nx].yard} unlocks ${TROOPS[nx].name}` : ''}`; }
  if (b.t === 'armoury') return `Upgrades troops up to level ${Math.min(10, lv + 1)}`;
  if (b.t === 'wall') return 'Blocks movement, gives cover in raids';
  return d.desc;
}

function buildingPanel(ctx, b, now) {
  const d = BUILDINGS[b.t], s = ctx.state;
  const btns = [];
  if (b.job) {
    const c = BS.speedUpCost(b, now);
    btns.push(`<button class="act2 gold" data-act="speed" data-id="${b.id}"><span class="i">⚡</span>Finish<span class="c" data-live="speedc">${ico('teeth')} ${c}</span></button>`);
  } else {
    const up = BS.upgradeInfo(s, b);
    if (up.ok) btns.push(`<button class="act2 ${afford(s, up.res, up.cost) && (up.time === 0 || BS.buildersFree(s) > 0) ? 'red' : 'off'}" data-act="upgrade" data-id="${b.id}"><span class="i">⬆</span>Upgrade<span class="c">${price(up.res, up.cost)}</span></button>`);
    else if (!up.max) btns.push(`<button class="act2 off" data-act="upgradeWhy" data-id="${b.id}"><span class="i">🔒</span>Upgrade<span class="c">Den ${Math.ceil((b.lv + 1) / 2)}</span></button>`);
  }
  if (d.produce && b.lv > 0 && b.till >= 1) btns.push(`<button class="act2" data-act="collectB" data-id="${b.id}"><span class="i">${ico(d.produce.res)}</span>Collect<span class="c" data-live="till">${d.produce.res === 'cash' ? money(b.till) : fmt(b.till)}</span></button>`);
  if (d.produce && b.lv > 0 && !b.lt) btns.push(`<button class="act2" data-act="hireLt" data-id="${b.id}"><span class="i">🕴</span>Lieutenant<span class="c">${money(BS.lieutenantCost(b))}</span></button>`);
  if (b.t === 'gym' || b.t === 'bunk') btns.push(`<button class="act2" data-act="gotoCrew" data-sub="army"><span class="i">🐾</span>Crew<span class="c">train</span></button>`);
  if (b.t === 'armoury') btns.push(`<button class="act2" data-act="gotoCrew" data-sub="upgrades"><span class="i">🔫</span>Troops<span class="c">upgrade</span></button>`);
  if (b.t === 'family') btns.push(`<button class="act2" data-act="family"><span class="i">🤝</span>Family<span class="c">soon</span></button>`);
  if (d.turret || b.t === 'den') btns.push(`<button class="act2" data-act="gotoCity"><span class="i">⚔</span>Raid<span class="c">rivals</span></button>`);
  btns.push(`<button class="act2" data-act="moveB" data-id="${b.id}"><span class="i">✥</span>Move<span class="c">&nbsp;</span></button>`);
  btns.push(`<button class="act2" data-act="infoB" data-id="${b.id}"><span class="i">ℹ</span>Info<span class="c">&nbsp;</span></button>`);
  const status = b.job ? `${b.job.kind === 'build' ? 'Building' : `Upgrading to Lv ${b.job.toLv}`} · <span data-live="jobleft">${dur((b.job.endsAt - now) / 1000)}</span>` : statLine(ctx, b);
  return `<div class="selbar"><div class="col grow" style="min-width:150px"><b class="h">${d.name}${b.lv ? ` <span class="lvtag">Lv ${b.lv}</span>` : ''}</b><span class="tiny dim">${status}</span></div>${btns.join('')}</div>`;
}

export function live(ctx, now) {
  const s = ctx.state;
  const obj = M.currentObjective(s);
  if ((obj ? `${obj.index}:${obj.done}` : 'none') !== ctx.sub.objKey && !document.querySelector('.overlay')) return ctx.render();
  const set = (sel, v) => { const n = document.querySelector(sel); if (n && n.textContent !== v) n.textContent = v; };
  set('[data-live="tapv"]', '+' + money(E.tapValue(s, now)));
  set('[data-live="builders"]', `${BS.buildersFree(s)}/${s.base.builders}`);
  const adl = document.querySelector('[data-live="adleft"]');
  if (adl) { const left = (s.boosts.adIncomeUntil - now) / 1000; if (left <= 0) return ctx.render(); adl.textContent = dur(left); }
  const u = ui(ctx);
  if (u.sel) {
    const it = BS.byId(s, u.sel);
    const j = it && BS.jobOf(it);
    if (j) { set('[data-live="jobleft"]', dur((j.endsAt - now) / 1000)); set('[data-live="speedc"]', ''); const sc=document.querySelector('[data-live="speedc"]'); if(sc) sc.innerHTML = ico('teeth') + ' ' + BS.speedUpCost(it, now); }
    if (it && BUILDINGS[it.t]?.produce) set('[data-live="till"]', BUILDINGS[it.t].produce.res === 'cash' ? money(it.till) : fmt(it.till));
  }
  if (view) view.dirty = true;
}

// called by app when timers finish or state changes outside this screen
export function refresh(ctx) { if (view) { syncGhost(ctx); panel(ctx); view.dirty = true; } }

// ---------------------------------------------------------------- build menu
function buildMenu(ctx) {
  const u = ui(ctx), s = ctx.state;
  const types = Object.keys(BUILDINGS).filter((t) => t !== 'den' && BUILDINGS[t].cat === u.cat);
  const card = (t) => {
    const d = BUILDINGS[t];
    const info = BS.unlockInfo(s, t);
    const cost = costOf(t, 1), tm = timeOf(t, 1);
    const can = info.ok && afford(s, d.res, cost);
    return `<button class="bcard ${info.ok ? '' : 'locked'}" data-act="pickBuild" data-type="${t}">
      <div class="im" style="background-image:url(assets/base/${spriteFor(t, 1)}.webp)"></div>
      <div class="nm">${d.name}</div>
      <div class="tiny ${can ? '' : 'red'}">${price(d.res, cost)}${tm ? ' · ' + dur(tm) : ' · instant'}</div>
      <div class="tiny dim">${info.ok ? `${BS.countOf(s, t)}/${BS.maxCount(s, t)} built` : info.reason}</div>
    </button>`;
  };
  return `<div class="row" style="justify-content:space-between;margin-bottom:6px;padding-right:34px"><div class="h" style="font-size:20px">Build</div>
    <div class="tiny dim">Builders free: ${BS.buildersFree(s)}/${s.base.builders} · Den level ${BS.denLevel(s)}</div></div>
    <div class="tabs">${CATS.map(([id, label]) => `<button class="${u.cat === id ? 'on' : ''}" data-act="buildCat" data-cat="${id}">${label}</button>`).join('')}</div>
    <div class="bgrid">${types.map(card).join('')}</div>`;
}

function enterPlace(ctx, type, moveId) {
  const u = ui(ctx), s = ctx.state;
  let spot;
  if (moveId) { const b = BS.byId(s, moveId); spot = { x: b.x, y: b.y }; }
  else {
    const t = view ? view.tileAtScreen(view.w / 2, view.h / 2) : { i: BS.DEN_POS.x, j: BS.DEN_POS.y };
    spot = BS.findFreeSpot(s.base, type, Math.max(0, t.i - 1), Math.max(0, t.j - 1)) || { x: t.i, y: t.j };
  }
  u.place = { type, x: spot.x, y: spot.y, moveId: moveId || null };
  u.sel = null;
  syncGhost(ctx); panel(ctx);
  if (view) { const sz = BUILDINGS[type].size; const c = view.centerOfFootprint(spot.x, spot.y, sz); if (c.x < 60 || c.x > view.w - 60 || c.y < 60 || c.y > view.h - 90) view.centerOn(spot.x, spot.y, sz); }
}

function infoModal(ctx, b) {
  const d = BUILDINGS[b.t], s = ctx.state;
  const lv = Math.max(1, b.lv), nx = lv + 1;
  const rows = [];
  const row = (k, a, c) => rows.push(`<tr><td class="dim">${k}</td><td>${a}</td><td class="green">${c ?? ''}</td></tr>`);
  const can = nx <= d.maxLv;
  if (d.produce) row(d.produce.res === 'cash' ? 'Cash per hour' : 'Rep per hour', fmt(rateOf(b.t, lv) * 3600), can ? fmt(rateOf(b.t, nx) * 3600) : null);
  if (d.produce) row('Holds', fmt(tillOf(b.t, lv)), can ? fmt(tillOf(b.t, nx)) : null);
  if (d.store) for (const r of ['cash', 'influence']) if (storeOf(b.t, lv, r)) row(`Stores ${resName(r)}`, fmt(storeOf(b.t, lv, r)), can ? fmt(storeOf(b.t, nx, r)) : null);
  if (d.housing) row('Troop space', housingOf(b.t, lv), can ? housingOf(b.t, nx) : null);
  if (d.turret) { const a = turretOf(b.t, lv), c = can ? turretOf(b.t, nx) : null; row('Damage', a.dmg, c?.dmg); row('Range', a.range, c?.range); row('Health', a.hp, c?.hp); }
  if (can) row('Next upgrade', `${price(d.res, costOf(b.t, nx))} · ${dur(timeOf(b.t, nx))}`);
  let unlocks = '';
  if (b.t === 'den' && nx <= 6) {
    const news = Object.entries(BUILDINGS).filter(([t, x]) => t !== 'den' && (x.counts[nx] || 0) > (x.counts[lv] || 0)).map(([t, x]) => `${x.name}${x.counts[lv] ? ` (+${x.counts[nx] - x.counts[lv]})` : ''}`);
    unlocks = `<div class="card small"><b class="red h">At Den level ${nx}</b><div class="dim">Buildings go up to level ${lvCap('stall', nx)}. New: ${news.join(', ') || 'more storage'}.</div></div>`;
  }
  ctx.modal(`<div class="row" style="gap:12px;align-items:flex-start">
    <div class="bimg" style="background-image:url(assets/base/${spriteFor(b.t, lv)}.webp)"></div>
    <div class="grow"><div class="h" style="font-size:22px">${d.name} <span class="lvtag">Lv ${b.lv}</span></div><div class="small dim">${d.desc}</div>
    <table class="stats">${rows.join('')}</table>${unlocks}</div></div>`, { center: true });
}

export const actions = {
  tap(ctx, el, e) {
    const v = E.tap(ctx.state, ctx.now());
    if (v > 0) ctx.floaty('+' + money(v), e.clientX || el.getBoundingClientRect().left + 40, e.clientY || el.getBoundingClientRect().top);
    else ctx.toast('Storage full: build a Strongbox');
    ctx.live();
  },
  adBoost(ctx) {
    const r = E.watchIncomeAd(ctx.state, ctx.now());
    ctx.toast(r.ok ? 'Reward ad (mock) watched: cash production x2 for 30 min' : 'Daily ad limit reached (6)');
    ctx.render();
  },
  claimObj(ctx) { const r = M.claimObjective(ctx.state); if (r.ok) ctx.toast('Reward: ' + rewardText(r.reward)); ctx.render(); },
  objHint(ctx) { const o = M.currentObjective(ctx.state); if (o) ctx.toast(o.text); },
  openBuild(ctx) { const u = ui(ctx); u.place = null; syncGhost(ctx); ctx.modal(buildMenu(ctx), { cls: 'wide' }); },
  buildCat(ctx, el) { ui(ctx).cat = el.dataset.cat; const sh = document.querySelector('.overlay .sheet'); if (sh) sh.innerHTML = '<button class="x" data-act="closeModal">✕</button>' + buildMenu(ctx); },
  pickBuild(ctx, el) {
    const t = el.dataset.type, s = ctx.state;
    const info = BS.unlockInfo(s, t);
    if (!info.ok) return ctx.toast(info.reason);
    const d = BUILDINGS[t];
    if (!afford(s, d.res, costOf(t, 1))) return ctx.toast(`Not enough ${resName(d.res)}`);
    if (timeOf(t, 1) > 0 && BS.buildersFree(s) < 1) return ctx.toast('All builders are busy. Finish a job or hire another builder.');
    ctx.closeModal(true);
    enterPlace(ctx, t);
  },
  placeOk(ctx) {
    const u = ui(ctx), p = u.place, s = ctx.state;
    if (!p) return;
    if (p.moveId) {
      const r = BS.moveBuilding(s, p.moveId, p.x, p.y);
      if (!r.ok) return ctx.toast(r.reason);
      u.sel = p.moveId; u.place = null;
    } else {
      const r = BS.startBuild(s, p.type, p.x, p.y, ctx.now());
      if (!r.ok) return ctx.toast(r.reason);
      ctx.toast(`${BUILDINGS[p.type].name} ${r.b.job ? 'under construction' : 'placed'}`);
      // walls: keep placing along the line, like laying a fence
      if (p.type === 'wall' && BS.unlockInfo(s, 'wall').ok && s.cash >= costOf('wall', 1)) {
        // next segment: keep going the same way if free, else turn
        const dir = p.dir || [1, 0];
        const tries = [dir, [dir[1], dir[0]], [-dir[1], -dir[0]], [-dir[0], -dir[1]]];
        const nxt = tries.find(([dx, dy]) => BS.canPlace(s.base, 'wall', p.x + dx, p.y + dy));
        if (nxt) u.place = { type: 'wall', x: p.x + nxt[0], y: p.y + nxt[1], moveId: null, dir: nxt };
        else { u.place = null; u.sel = r.b.id; }
      } else { u.place = null; u.sel = r.b.id; }
    }
    ctx.save(); syncGhost(ctx); panel(ctx); ctx.live();
  },
  placeCancel(ctx) { const u = ui(ctx); u.sel = u.place?.moveId || null; u.place = null; syncGhost(ctx); panel(ctx); },
  upgrade(ctx, el) {
    const b = BS.byId(ctx.state, el.dataset.id);
    const up = BS.upgradeInfo(ctx.state, b);
    if (!up.ok) return ctx.toast(up.reason);
    const r = BS.startUpgrade(ctx.state, el.dataset.id, ctx.now());
    ctx.toast(r.ok ? `Upgrading ${BUILDINGS[b.t].name} to level ${up.to}` : r.reason);
    ctx.save(); refresh(ctx); ctx.live();
  },
  upgradeWhy(ctx, el) { const b = BS.byId(ctx.state, el.dataset.id); ctx.toast(BS.upgradeInfo(ctx.state, b).reason); },
  collectB(ctx, el, e) {
    const r = BS.collect(ctx.state, el.dataset.id);
    if (r.ok) ctx.floaty('+' + (r.res === 'cash' ? money(r.amount) : fmt(r.amount) + ' Rep'), e.clientX || 300, e.clientY || 300);
    else if (r.full) ctx.toast('Storage full');
    refresh(ctx); ctx.live();
  },
  hireLt(ctx, el) {
    const r = BS.hireLieutenant(ctx.state, el.dataset.id);
    ctx.toast(r.ok ? 'Lieutenant hired: this building now collects by itself, even offline' : r.reason || 'Cannot hire');
    refresh(ctx); ctx.live();
  },
  moveB(ctx, el) { const b = BS.byId(ctx.state, el.dataset.id); enterPlace(ctx, b.t, b.id); },
  infoB(ctx, el) { infoModal(ctx, BS.byId(ctx.state, el.dataset.id)); },
  speed(ctx, el) {
    const r = BS.speedUp(ctx.state, el.dataset.id, ctx.now());
    if (!r.ok) return ctx.toast(r.reason || 'Nothing to finish');
    ctx.app.handleBaseEvents(r.ev);
    refresh(ctx); ctx.live();
  },
  clearO(ctx, el) {
    const r = BS.startClear(ctx.state, el.dataset.id, ctx.now());
    if (!r.ok) return ctx.toast(r.reason);
    ctx.save(); refresh(ctx); ctx.live();
  },
  builders(ctx) {
    const s = ctx.state, n = s.base.builders;
    const next = BS.BUILDER_TEETH[n + 1];
    ctx.modal(`<div class="h" style="font-size:22px">Builders</div>
      <p class="dim small">Every build, upgrade and clear-up needs a free builder. ${BS.buildersFree(s)} of ${n} free right now.</p>
      ${n < BS.MAX_BUILDERS ? `<div class="card row"><div class="grow"><b class="h">Hire builder #${n + 1}</b><div class="tiny dim">Permanent. Two builders roughly doubles how fast your base grows.</div></div>
        <button class="btn gold" data-act="hireBuilder">${ico('teeth')} ${next}</button></div>
        <div class="tiny faint">Or buy the Second Builder pack in the Shop (£3.99, prototype: free).</div>` : '<p class="green">All builders hired.</p>'}`, { center: true });
  },
  hireBuilder(ctx) { const r = BS.buyBuilder(ctx.state); ctx.closeModal(true); ctx.toast(r.ok ? `New builder hired (${r.cost} Ice)` : r.reason); ctx.render(); },
  gotoCrew(ctx, el) { ctx.sub.crewTab = el.dataset.sub; ctx.go('crew'); },
  gotoCity(ctx) { ctx.go('city'); },
  family(ctx) {
    ctx.modal(`<div class="h" style="font-size:22px">Family Club</div><p class="dim">Families are the clan system: up to 30 players, shared chat, crew donations, Family wars on the city map and a shared Family Den to upgrade together.</p>
      <p class="small">Needs online accounts and a server, so it's a placeholder in this prototype.</p>`, { center: true });
  },
};
