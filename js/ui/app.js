// UI controller: owns the state object, the clock, persistence and screen routing.
// Rules live in js/core/*; this layer only renders and forwards player intents.
import { GAME, TROOPS } from '../core/data.js';
import { newGame, makeLocalStorage } from '../core/state.js';
import * as E from '../core/economy.js';
import * as C from '../core/crew.js';
import * as M from '../core/meta.js';
import { fmt, money, dur, esc, ico } from './fmt.js';
import * as Hideout from './hideout.js';
import * as BS from '../core/base.js';
import { BUILDINGS, OBSTACLES } from '../core/buildings.js';
import * as Crew from './crew.js';
import * as City from './city.js';
import * as Jobs from './jobs.js';
import * as Shop from './shop.js';
import * as Battle from './battle.js';
import * as Missions from './missions.js';
import * as Audio from './audio.js';
import * as Tactics from './tactics.js';
import * as Heroes from './heroes.js';
import * as Loadout from './loadout.js';
import * as Editor from './editor.js';
import * as Character from './character.js';
import { formatDrop } from '../core/shards.js';
import { THEMES, loadTheme, saveTheme, themeAttr } from '../core/themes.js';
import * as P from '../core/progression.js';

const params = new URLSearchParams(location.search);
const storage = makeLocalStorage(window.localStorage);
if (params.has('reset')) storage.clear();

const SCREENS = { base: Hideout, crew: Crew, missions: Missions, city: City, jobs: Jobs, shop: Shop, battle: Battle, tactics: Tactics, heroes: Heroes, loadout: Loadout, editor: Editor, hero: Character };
// [tab, icon, label, feature that unlocks it (player level)]
const NAV = [
  ['base', '🏚️', 'Hideout'], ['crew', '🐾', 'Crew'], ['missions', '🎯', 'Ops'], ['jobs', '🛏️', 'Safehouse', 'stockpile'], ['city', '📍', 'City', 'pvpcopy'], ['shop', '⚖️', 'Market', 'market'],
];

export const ctx = {
  state: null,
  tab: 'base',
  sub: {},              // per-screen UI-only state (not saved)
  fast: params.has('fast'),
  timeOffset: 0,        // debug: shift the clock to test offline earnings
  now() { return Date.now() + this.timeOffset; },
  save() { if (this.state) storage.save(this.state); },
  go(tab) { this.tab = tab; this.render(); document.getElementById('screen').scrollTop = 0; },
  render, toast, baseTip, modal, closeModal, floaty, live,
  app: { handleBaseEvents },
  fmt, money, dur, esc,
};
window.__game = ctx; // exposed for automated tests and debugging

const $ = (sel, root = document) => root.querySelector(sel);

function topbar() {
  const s = ctx.state, now = ctx.now();
  const vip = E.isVip(s, now) ? '<span class="vipbadge">MADE</span>' : '';
  const cap = BS.caps(s);
  const e = P.energy(s, now), plv = P.playerLv(s), need = P.playerXpNeed(plv);
  return `
    <button class="res plv" data-act="openTrack" title="Player level · Rookie Track"><span class="lvb">Lv <b data-live="plv">${plv}</b></span><div class="col grow"><div class="capbar xp"><i data-live-bar="pxp" style="width:${need ? Math.min(100, (s.player.xp / need) * 100) : 100}%"></i></div></div></button>
    <div class="res cash"><span class="ico">${ico('cash')}</span><div class="col grow"><b data-live="cash">${money(s.cash)}</b><div class="capbar"><i data-live-bar="cash" style="width:${Math.min(100, (s.cash / cap.cash) * 100)}%"></i></div></div><span class="cap tiny" data-live="capcash">/${fmt(cap.cash)}</span>${vip}</div>
    ${P.isUnlocked(s, 'rep') ? `<div class="res inf"><span class="ico">${ico('influence')}</span><div class="col grow"><b data-live="influence">${fmt(Math.floor(s.influence))}</b><div class="capbar"><i data-live-bar="influence" style="width:${Math.min(100, (s.influence / cap.influence) * 100)}%"></i></div></div><span class="cap tiny" data-live="capinf">/${fmt(cap.influence)}</span></div>` : ''}
    ${P.isUnlocked(s, 'market') ? `<div class="res teeth" data-act="nav" data-tab="shop"><span class="ico">${ico('teeth')}</span><b data-live="teeth">${fmt(s.teeth)}</b><span class="plus">+</span></div>` : ''}
    <button class="res energy ${e.n ? '' : 'empty'}" data-act="energyInfo" title="Energy: 1 per op, +1 every 10 minutes"><span class="ico">⚡</span><b data-live="energy">${e.n}/${e.max}</b><span class="tiny dim" data-live="enext">${e.nextMs ? dur(e.nextMs / 1000) : 'full'}</span></button>
    <button class="muter gear" data-act="openSettings" title="Settings">⚙️</button>
    ${Audio.muteButton()}`;
}

function nav() {
  const s = ctx.state, now = ctx.now();
  const dot = {
    jobs: !M.dailyStatus(s, now).claimedToday || s.jobs.list.some((j) => !j.claimed && M.jobProgress(s, j).done),
    crew: Object.values(s.heroes?.owned || {}).some((h) => h.pendingPerk),
    base: !!(M.currentObjective(s)?.done),
  };
  dot.jobs = P.isUnlocked(s, 'stockpile') && (P.stockpile(s, now).full || (s.opJobs || []).some((j) => now >= j.end));
  dot.base = dot.base || (P.isUnlocked(s, 'track') && !!P.trackCurrent(s)?.done);
  return NAV.map(([id, ico, label, feat]) => {
    if (feat && !P.isUnlocked(s, feat)) return `<button data-act="lockedFeature" data-id="${feat}" class="locked"><span class="i">🔒</span>${label}<span class="lvt">Lv ${P.unlockLv(feat)}</span></button>`;
    return `<button data-act="nav" data-tab="${id}" class="${ctx.tab === id ? 'on' : ''}"><span class="i">${ico}</span>${label}${dot[id] ? '<span class="dotn"></span>' : ''}</button>`;
  }).join('');
}

function render() {
  const s = ctx.state;
  if (!s) return;
  if (s.tactics && ctx.tab !== 'tactics') ctx.tab = 'tactics';
  else if (s.battle && ctx.tab !== 'battle') ctx.tab = 'battle';
  const scr = SCREENS[ctx.tab];
  applyTheme();
  const inBattle = ctx.tab === 'battle' || ctx.tab === 'tactics' || ctx.tab === 'editor' || ctx.tab === 'hero';
  $('#topbar').style.display = inBattle ? 'none' : '';
  $('#nav').style.display = inBattle ? 'none' : '';
  $('#topbar').innerHTML = topbar();
  $('#app').classList.toggle('mode-base', ctx.tab === 'base');
  $('#app').classList.toggle('mode-battle', ctx.tab === 'battle');
  $('#app').classList.toggle('mode-tactics', ctx.tab === 'tactics');
  $('#app').classList.toggle('mode-editor', ctx.tab === 'editor');
  $('#app').classList.toggle('mode-hero', ctx.tab === 'hero');
  $('#nav').innerHTML = nav();
  syncBattleMute();
  const el = $('#screen');
  const keep = el.scrollTop;
  el.innerHTML = scr.render(ctx);
  el.scrollTop = keep;
  scr.mount?.(ctx, el);
  live();
  flushTips();
}

// ---------------------------------------------------------------- theme (Settings)
let theme = loadTheme(window.localStorage);
function applyTheme() {
  const a = themeAttr(theme, ctx.tab), root = document.documentElement;
  if (a) root.dataset.theme = a; else delete root.dataset.theme;
}
function settingsHtml() {
  return `<div class="h" style="font-size:22px">Settings</div>
    <div class="sect">Theme <span class="tiny dim" style="text-transform:none;letter-spacing:0">· menus and screens; battles keep their own look</span></div>
    <div class="themegrid">${THEMES.map((t) => `<button class="themeopt ${t.id === theme ? 'on' : ''}" data-act="setTheme" data-id="${t.id}">
      <span class="tsw">${t.sw.map((c) => `<i style="background:${c}"></i>`).join('')}</span>
      <b class="h small">${esc(t.name)}${t.id === theme ? ' ✓' : ''}</b><span class="tiny dim">${esc(t.blurb)}</span></button>`).join('')}</div>
    <div class="sect">Sound</div>
    <button class="btn" data-act="toggleMute">${Audio.isMuted() ? '🔇 Sound off' : '🔊 Sound on'}</button>
    <div class="tiny faint" style="margin-top:8px">Fang City v${GAME.version}</div>`;
}
function refreshSettings() { const el = document.querySelector('.overlay .sheet'); if (el && el.querySelector('.themegrid')) el.innerHTML = '<button class="x" data-act="closeModal">✕</button>' + settingsHtml(); }

function live() {
  const s = ctx.state, now = ctx.now();
  const set = (k, v) => document.querySelectorAll(`[data-live="${k}"]`).forEach((n) => { if (n.textContent !== v) n.textContent = v; });
  set('cash', money(s.cash));
  set('influence', fmt(Math.floor(s.influence)));
  set('teeth', fmt(s.teeth));
  const e = P.energy(s, now);
  set('energy', `${e.n}/${e.max}`);
  set('enext', e.nextMs ? dur(e.nextMs / 1000) : 'full');
  const cap = BS.caps(s);
  set('capcash', '/' + fmt(cap.cash)); set('capinf', '/' + fmt(cap.influence));
  for (const r of ['cash', 'influence']) { const b = document.querySelector(`[data-live-bar="${r}"]`); if (b) { b.style.width = Math.min(100, (s[r] / cap[r]) * 100) + '%'; b.classList.toggle('full', s[r] >= cap[r] - 0.5); } }
  SCREENS[ctx.tab].live?.(ctx, now);
}

// ---------------------------------------------------------------- overlays
let modalEl = null;
function modal(html, { center = false, onClose, closable = true, backdrop = true, cls = '' } = {}) {
  closeModal(true);
  modalEl = document.createElement('div');
  modalEl.className = 'overlay' + (center ? ' center' : '') + (cls ? ' ' + cls : '');
  modalEl.innerHTML = `<div class="sheet">${closable ? '<button class="x" data-act="closeModal">✕</button>' : ''}${html}</div>`;
  modalEl.addEventListener('click', (e) => { if (e.target === modalEl && closable && backdrop) closeModal(); });
  modalEl._onClose = onClose;
  $('#app').appendChild(modalEl);
  return modalEl;
}
function closeModal(silent) {
  if (!modalEl) return;
  const cb = modalEl._onClose;
  modalEl.remove(); modalEl = null;
  if (!silent && cb) cb();
}
let toastTimer;
// Base/city tutorial tips never show over a fight: they wait until you are back at base.
let pendingTips = [];
const battleOpen = () => ctx.tab === 'battle' || ctx.tab === 'tactics' || !!(ctx.state && (ctx.state.tactics || ctx.state.battle));
function baseTip(msg) {
  if (battleOpen()) { if (!pendingTips.includes(msg)) pendingTips.push(msg); return; }
  toast(msg, true);
}
function flushTips() {
  if (battleOpen()) {
    // a tip cut short by a fight is shown again back at base
    document.querySelectorAll('.toast.basetip').forEach((t) => { if (!pendingTips.includes(t.textContent)) pendingTips.push(t.textContent); t.remove(); });
    return;
  }
  if (!pendingTips.length) return;
  const msg = pendingTips.shift();
  toast(msg, true);
}
function toast(msg, tip = false) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const t = document.createElement('div');
  t.className = tip ? 'toast basetip' : 'toast'; t.textContent = msg;
  $('#app').appendChild(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 2200);
}
function floaty(text, x, y) {
  const app = $('#app').getBoundingClientRect();
  const f = document.createElement('div');
  f.className = 'floaty'; f.textContent = text;
  f.style.left = (x - app.left) + 'px'; f.style.top = (y - app.top - 10) + 'px';
  $('#app').appendChild(f);
  setTimeout(() => f.remove(), 900);
}

// building / clearing timers finished: toast it and refresh the base
function handleBaseEvents(ev) {
  if (!ev || !ev.length) return;
  const e = ev[ev.length - 1];
  const name = (BUILDINGS[e.t] || OBSTACLES[e.t]).name;
  let msg = e.type === 'built' ? `${name} is open for business` : e.type === 'upgraded' ? `${name} upgraded to level ${e.lv}` : `${name} cleared${e.teeth ? `: found ${e.teeth} Ice` : ''}${e.shards ? `${e.teeth ? ' and ' : ': '}${formatDrop(e.shards)}` : e.teeth ? '!' : ''}`;
  if (ev.length > 1) msg += ` (+${ev.length - 1} more done)`;
  toast(msg);
  ctx.save();
  if (ctx.tab === 'base') { Hideout.refresh(ctx); if (ev.some((x) => x.t === 'den')) render(); }
  $('#topbar') && ($('#topbar').innerHTML = topbar());
}

// ---------------------------------------------------------------- player level / Rookie Track (v0.10)
const trackReward = (r) => [r.cash ? money(r.cash) : '', r.teeth ? `${r.teeth} Ice` : '', r.influence ? `${r.influence} Rep` : '', r.universal ? `${r.universal} shards` : ''].filter(Boolean).join(' + ');
function levelRoad(s) {
  const lv = P.playerLv(s);
  const stops = [...new Set(P.UNLOCKS.map((u) => u.lv))];
  return `<div class="lroad">${stops.map((l) => {
    const items = P.UNLOCKS.filter((u) => u.lv === l && !/^squad[23]$/.test(u.id));
    const st = lv >= l ? 'got' : (stops.find((x) => x > lv) === l ? 'next' : 'later');
    return `<div class="lstop ${st}"><div class="lnum">Lv ${l}</div>${items.map((u) => `<div class="litem" title="${esc(u.text)}">${u.ico} ${esc(u.name)}</div>`).join('')}</div>`;
  }).join('')}</div>`;
}
function openTrack(c) {
  const s = c.state, lv = P.playerLv(s), need = P.playerXpNeed(lv);
  const nx = P.nextUnlock(s);
  const open = P.isUnlocked(s, 'track');
  const steps = open ? P.trackState(s) : [];
  const cur = steps.find((x) => x.current);
  const stepHtml = open ? `<div class="tracklist">${steps.map((x) => `<div class="tstep ${x.claimed ? 'claimed' : x.current ? (x.done ? 'ready' : 'cur') : 'todo'}">
      <span class="tsn">${x.claimed ? '✓' : x.i + 1}</span><span class="tt small">${esc(x.text)}</span><span class="tr tiny">${trackReward(x.reward)}</span>
      ${x.current && x.done ? '<button class="btn sm red" data-act="claimTrack">Claim</button>' : ''}</div>`).join('')}</div>`
    : `<div class="card tiny dim">🔒 The Rookie Track opens at Lv ${P.unlockLv('track')}: 20 goals with rewards that walk you through the game.</div>`;
  modal(`<div class="trackhead"><div><div class="h" style="font-size:21px">${open ? 'Rookie Track' : 'Player level'} · Lv ${lv}</div>
      <div class="xpbar wide"><i style="width:${need ? Math.min(100, (s.player.xp / need) * 100) : 100}%"></i></div>
      <div class="tiny dim">${need ? `${s.player.xp}/${need} XP to Lv ${lv + 1} · earn XP from ops` : 'Max level'}${open ? ` · step ${Math.min(20, s.track.claimed + 1)}/20` : ''}</div></div>
      ${nx ? `<div class="nextun"><div class="tiny gold h">Next unlock · Lv ${nx.lv}</div><div class="small">${nx.items.map((u) => `${u.ico} ${esc(u.name)}`).join(' · ')}</div></div>` : ''}</div>
    ${levelRoad(s)}
    ${stepHtml}`, { cls: 'wide trackov' });
  if (cur) { const el = document.querySelector('.tstep.cur, .tstep.ready'); el && el.scrollIntoView({ block: 'center' }); }
}
export function levelUpHtml(px) {
  if (!px || !px.levels || !px.levels.length) return '';
  const lv = px.levels[px.levels.length - 1];
  return `<div class="lvup"><div class="h">Level up! · Lv ${lv}</div>${px.unlocks.length ? `<div class="tiny">Unlocked: ${px.unlocks.map((u) => `${u.ico} <b>${esc(u.name)}</b>`).join(' · ')}</div>` : ''}</div>`;
}

// ---------------------------------------------------------------- input
const GLOBAL_ACTIONS = {
  nav: (c, el) => { const n = NAV.find((x) => x[0] === el.dataset.tab); if (n && n[3] && !P.isUnlocked(c.state, n[3])) return toast(`${n[2]} unlocks at player level ${P.unlockLv(n[3])}`); c.go(el.dataset.tab); },
  closeModal: (c, el) => { if (el && el.dataset && el.dataset.then) c.sub.afterBattle = el.dataset.then; closeModal(); },
  toggleMute: () => { Audio.toggleMute(); render(); refreshSettings(); },
  openSettings: (c) => c.modal(settingsHtml(), { cls: 'wide' }),
  setTheme: (c, el) => { theme = saveTheme(window.localStorage, el.dataset.id); applyTheme(); refreshSettings(); },
  openHero: (c, el, e) => { if (e && e.target && e.target.closest('button') && e.target.closest('button') !== el) return; c.closeModal && c.closeModal(); Character.openCharacter(c, el.dataset.id); },
  openTrack: (c) => openTrack(c),
  claimTrack: (c) => { const r = P.claimTrack(c.state); if (!r.ok) return toast(r.reason); Audio.play('collect'); toast('Track reward: ' + trackReward(r.reward)); if (document.querySelector('.trackov')) openTrack(c); $('#topbar').innerHTML = topbar(); $('#nav').innerHTML = nav(); if (c.tab === 'base') render(); },
  energyInfo: (c) => Missions.energyModal(c),
  startOp: (c, el) => Missions.startOpById(c, el.dataset.id),
  refillEnergy: (c) => { const r = P.refillEnergy(c.state, c.now()); if (!r.ok) return toast(r.reason); closeModal(true); toast('Energy refilled'); render(); },
  lockedFeature: (c, el) => { const u = P.UNLOCKS.find((x) => x.id === el.dataset.id); toast(u ? `${u.name} unlocks at player level ${u.lv}` : 'Locked'); },
  collectStockHud: (c) => { const r = P.collectStockpile(c.state, c.now()); if (!r.ok) return toast(r.reason); Audio.play('collect'); toast(`Stockpile: +${money(r.cash)}${r.ammo ? ` · +${r.ammo} ammo` : ''}`); render(); },
  openEditor: (c, el) => { c.sub.editorBack = c.tab === 'editor' ? (c.sub.editorBack || 'heroes') : c.tab; c.closeModal && c.closeModal(); Editor.openEditor(c, el && el.dataset && el.dataset.id); },
};
function unlockAudio() { Audio.unlock(); syncBattleMute(); }
document.addEventListener('pointerdown', unlockAudio, { once: true, capture: true });

function dispatchAct(el, e) {
  const act = el.dataset.act;
  if (act !== 'toggleMute' && e.type === 'click') Audio.play('tap');
  const handler = GLOBAL_ACTIONS[act] || SCREENS[ctx.tab].actions?.[act] || Shop.actions[act] || Crew.actions[act] || Hideout.actions[act] || Heroes.actions[act] || Loadout.actions[act];
  if (handler) { handler(ctx, el, e); ctx.save(); }
}
document.getElementById('app').addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.hasAttribute('disabled')) return;
  if (el.tagName === 'SELECT') return; // wait for change
  dispatchAct(el, e);
});
document.getElementById('app').addEventListener('pointerover', (e) => {
  const el = e.target.closest('[data-apcost]');
  if (!el || ctx.tab !== 'tactics' || !ctx.sub.tactics) return;
  ctx.sub.tactics.abilityHover = { mode: el.dataset.mode || '', ap: +el.dataset.apcost };
});
document.getElementById('app').addEventListener('pointerout', (e) => {
  if (!ctx.sub || !ctx.sub.tactics) return;
  const el = e.target.closest('[data-apcost]');
  if (!el) return;
  const to = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('[data-apcost]');
  if (to) return;
  ctx.sub.tactics.abilityHover = null;
});
document.getElementById('app').addEventListener('change', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.hasAttribute('disabled')) return;
  dispatchAct(el, e);
});

function syncBattleMute() {
  let b = document.getElementById('muter-float');
  if (!b) {
    b = document.createElement('button');
    b.id = 'muter-float';
    b.dataset.act = 'toggleMute';
    document.getElementById('app').appendChild(b);
  }
  b.className = 'muter float' + (Audio.isMuted() ? ' off' : '');
  b.title = Audio.isMuted() ? 'Unmute' : 'Mute';
  b.textContent = Audio.isMuted() ? '🔇' : '🔊';
}

// ---------------------------------------------------------------- boot
function welcomeBack(sum) {
  if (!sum) return;
  modal(`
    <div class="result win"><div class="h dim">While you were away (${dur(sum.seconds)})</div>
    <div class="big">${money(sum.banked + sum.tills)}</div>
    <div class="dim small">${sum.banked >= 1 ? `${money(sum.banked)} banked by your lieutenants · ` : ''}${sum.tills > 0 ? `${money(sum.tills)} waiting to collect` : ''}${sum.influence >= 1 ? ` · ${ico('influence')} ${fmt(Math.floor(sum.influence))} Rep` : ''}</div>
    ${sum.finished || sum.cleared ? `<div class="small" style="margin-top:4px">🔨 ${sum.finished ? `${sum.finished} build job${sum.finished > 1 ? 's' : ''} finished` : ''}${sum.finished && sum.cleared ? ' · ' : ''}${sum.cleared ? `${sum.cleared} junk pile${sum.cleared > 1 ? 's' : ''} cleared` : ''}</div>` : ''}
    ${sum.cappedSeconds < sum.seconds ? `<div class="tiny faint" style="margin-top:6px">Offline earnings cap at ${dur(sum.cappedSeconds)}. Made Members get 12h.</div>` : ''}
    <div class="row" style="margin-top:14px">
      <button class="btn block" data-act="closeModal">Collect</button>
      ${sum.banked > 0 ? `<button class="btn gold block" data-act="doubleOffline">▶ Double it (ad)</button>` : ''}
    </div></div>`, { center: true });
  GLOBAL_ACTIONS.doubleOffline = (c) => { const v = E.doubleOffline(c.state, sum); closeModal(); toast(`Ad watched (mock): +${money(v)}`); render(); };
}

function startNewGame() {
  ctx.state = newGame(ctx.now());
  M.ensureJobs(ctx.state, ctx.now());
  ctx.save(); render();
  baseTip('Welcome to Fang City. Tap NEXT OP for Rook\'s street lesson — it is free.');
  if (!ctx.fast) {
    modal(`<div class="h" style="font-size:22px">Rook is ready</div>
      <p class="small">Every crew starts with the same operator — <b>Rook</b>, a wolf Bruiser who fights up close. Tap him in My Crew to open his inventory: weapons, armour and gear change his stats, and he learns new wolf abilities as he levels up. Three short tutorial ops teach action points, cover and his Pounce. New features open as your <b>player level</b> rises — each op after the tutorial costs 1 energy, which refills while you are away.</p>
      <div class="row" style="margin-top:12px">
        <button class="btn red block" data-act="startTutorial">Start the lesson</button>
        <button class="btn block" data-act="closeModal">Look around first</button>
      </div>`, { center: true });
  }
}

function splash(next) {
  const sp = document.createElement('div');
  sp.className = 'splash';
  sp.innerHTML = `<div class="logo">Fang<br><span>City</span></div>
    <div class="h dim" style="letter-spacing:.2em;margin:6px 0 18px">Animal Gangs · prototype ${GAME.version}</div>
    <button class="btn red block" id="play">Play</button>
    <div class="tiny faint" style="margin-top:10px;text-align:center">Concept prototype. No real payments.</div>`;
  $('#app').appendChild(sp);
  const go = () => { Audio.unlock(); sp.remove(); next(); };
  sp.querySelector('#play').addEventListener('click', go);
  if (ctx.fast) go();
}

function loop() {
  const s = ctx.state;
  if (s) {
    const now = ctx.now();
    const dt = Math.min(5, Math.max(0, (now - s.lastTick) / 1000));
    E.tick(s, dt, now);
    const ev = BS.finishTimers(s, now);
    if (ev.length) handleBaseEvents(ev);
    if (BS.maybeSpawnObstacle(s, now) && ctx.tab === 'base') Hideout.refresh(ctx);
    if (s.clinic && s.clinic.length) { const healed = P.tickClinic(s, now); if (healed.length) { toast(`${healed.map((id) => P.heroName(id)).join(', ')} patched up and ready`); ctx.save(); } }
    const done = C.finishQueue(s, now);
    const res = C.finishResearch(s, now);
    if (done.length) toast(done.length === 1 ? `${TROOPS[done[0]].name} is ready` : `${done.length} troops are ready`);
    if (res) toast(`${TROOPS[res.t].name} upgraded to level ${res.lv}`);
    if (done.length || res) { ctx.save(); if (ctx.tab === 'crew') render(); else $('#nav').innerHTML = nav(); }
    live();
  }
}

function boot() {
  const now = ctx.now();
  const saved = storage.load(now);
  if (saved) {
    ctx.state = saved;
    if (saved.migratedFrom) {
      const from = saved.migratedFrom;
      delete saved.migratedFrom;
      M.ensureJobs(saved, now);
      render();
      const army = Object.entries(saved.army).map(([t, n]) => `${n}× ${TROOPS[t].name}`).join(', ');
      modal(`<div class="h" style="font-size:22px">${from === 1 ? 'The Hideout moved' : 'Fang City 0.3: one crew, many animals'}</div>
        <p class="dim">${from === 1 ? 'Fang City now has a free-build base. Your turf, Ice and purchases came with you; your old rackets were sold off.' : 'Gangs are gone: every boss now runs one mixed crew. Your base is untouched.'}</p>
        <p class="small">Your old crew became troops: <b>${army}</b>. Spare gear was sold${saved.gearRefund ? ` for ${money(saved.gearRefund)}` : ''}, and you get +${from === 1 ? 100 : 50} Ice.</p>
        <p class="small">New: train troops in <b>My Crew</b>, unlock bosses with The Den, and fight the four gangs in <b>Missions</b>.</p>
        <button class="btn red block" data-act="closeModal">Let's go</button>`, { center: true });
      delete saved.gearRefund;
      ctx.save();
    } else {
    const sum = E.applyOffline(saved, now);
    C.finishQueue(saved, now); C.finishResearch(saved, now);
    M.ensureJobs(saved, now);
    render();
    welcomeBack(sum);
    }
  } else {
    startNewGame();
  }
  // Debug: ?level=N jumps the player level (unlocks + grants), ?energy=N sets energy.
  if (params.has('level') && ctx.state) {
    const lv = P.setPlayerLevel(ctx.state, +params.get('level'), ctx.now());
    if (lv >= 3) { ctx.state.ops.cleared.t1 ||= 1; ctx.state.ops.cleared.t2 ||= 1; ctx.state.ops.cleared.t3 ||= 1; }
    ctx.save(); render(); toast(`Debug: player level ${lv}`);
  }
  if (params.has('energy') && ctx.state) { ctx.state.energy = { n: Math.max(0, Math.min(P.ENERGY_MAX, +params.get('energy') || 0)), at: ctx.now() }; ctx.save(); render(); }
  if (ctx.state && ctx.state.migratedTo7) {
    delete ctx.state.migratedTo7; ctx.save();
    modal(`<div class="h" style="font-size:22px">Fang City 0.10: player levels</div>
      <p class="small">Features now open as your <b>player level</b> rises. From what you have played you start at <b>Lv ${P.playerLv(ctx.state)}</b>. Ops are short 3–5 minute fights that cost 1 energy (10 max, +1 every 10 minutes). Tap the <b>Lv</b> badge for the Rookie Track and what unlocks next.</p>
      <button class="btn red block" data-act="closeModal">Got it</button>`, { center: true });
  }
  setInterval(loop, 200);
  setInterval(() => ctx.save(), 5000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) ctx.save();
    else if (ctx.state) { const sum = E.applyOffline(ctx.state, ctx.now()); render(); welcomeBack(sum); }
  });
  window.addEventListener('pagehide', () => ctx.save());
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if ((ctx.tab === 'battle' && !ctx.sub.battle?.busy) || ctx.tab === 'tactics') render(); }, 150); });
}

splash(boot);
