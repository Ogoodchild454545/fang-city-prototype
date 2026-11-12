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

const params = new URLSearchParams(location.search);
const storage = makeLocalStorage(window.localStorage);
if (params.has('reset')) storage.clear();

const SCREENS = { base: Hideout, crew: Crew, missions: Missions, city: City, jobs: Jobs, shop: Shop, battle: Battle };
const NAV = [
  ['base', '🏚️', 'Hideout'], ['crew', '🐾', 'Crew'], ['missions', '🎯', 'Missions'], ['city', '📍', 'City'], ['jobs', '💼', 'Jobs'], ['shop', '⚖️', 'Market'],
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
  render, toast, modal, closeModal, floaty, live,
  app: { handleBaseEvents },
  fmt, money, dur, esc,
};
window.__game = ctx; // exposed for automated tests and debugging

const $ = (sel, root = document) => root.querySelector(sel);

function topbar() {
  const s = ctx.state, now = ctx.now();
  const vip = E.isVip(s, now) ? '<span class="vipbadge">MADE</span>' : '';
  const cap = BS.caps(s);
  return `
    <div class="res cash"><span class="ico">${ico('cash')}</span><div class="col grow"><b data-live="cash">${money(s.cash)}</b><div class="capbar"><i data-live-bar="cash" style="width:${Math.min(100, (s.cash / cap.cash) * 100)}%"></i></div></div><span class="cap tiny" data-live="capcash">/${fmt(cap.cash)}</span>${vip}</div>
    <div class="res inf"><span class="ico">${ico('influence')}</span><div class="col grow"><b data-live="influence">${fmt(Math.floor(s.influence))}</b><div class="capbar"><i data-live-bar="influence" style="width:${Math.min(100, (s.influence / cap.influence) * 100)}%"></i></div></div><span class="cap tiny" data-live="capinf">/${fmt(cap.influence)}</span></div>
    <div class="res teeth" data-act="nav" data-tab="shop"><span class="ico">${ico('teeth')}</span><b data-live="teeth">${fmt(s.teeth)}</b><span class="plus">+</span></div>
    ${Audio.muteButton()}`;
}

function nav() {
  const s = ctx.state, now = ctx.now();
  const dot = {
    jobs: !M.dailyStatus(s, now).claimedToday || s.jobs.list.some((j) => !j.claimed && M.jobProgress(s, j).done),
    crew: C.armyCount(s) === 0 && !s.queue.length,
    base: !!(M.currentObjective(s)?.done),
  };
  return NAV.map(([id, ico, label]) => `<button data-act="nav" data-tab="${id}" class="${ctx.tab === id ? 'on' : ''}"><span class="i">${ico}</span>${label}${dot[id] ? '<span class="dotn"></span>' : ''}</button>`).join('');
}

function render() {
  const s = ctx.state;
  if (!s) return;
  if (s.battle && ctx.tab !== 'battle') ctx.tab = 'battle';
  const scr = SCREENS[ctx.tab];
  const inBattle = ctx.tab === 'battle';
  $('#topbar').style.display = inBattle ? 'none' : '';
  $('#nav').style.display = inBattle ? 'none' : '';
  $('#topbar').innerHTML = topbar();
  $('#app').classList.toggle('mode-base', ctx.tab === 'base');
  $('#app').classList.toggle('mode-battle', inBattle);
  $('#nav').innerHTML = nav();
  syncBattleMute();
  const el = $('#screen');
  const keep = el.scrollTop;
  el.innerHTML = scr.render(ctx);
  el.scrollTop = keep;
  scr.mount?.(ctx, el);
  live();
}

function live() {
  const s = ctx.state, now = ctx.now();
  const set = (k, v) => document.querySelectorAll(`[data-live="${k}"]`).forEach((n) => { if (n.textContent !== v) n.textContent = v; });
  set('cash', money(s.cash));
  set('influence', fmt(Math.floor(s.influence)));
  set('teeth', fmt(s.teeth));
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
function toast(msg) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
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
  let msg = e.type === 'built' ? `${name} is open for business` : e.type === 'upgraded' ? `${name} upgraded to level ${e.lv}` : `${name} cleared${e.teeth ? `: found ${e.teeth} Ice!` : ''}`;
  if (ev.length > 1) msg += ` (+${ev.length - 1} more done)`;
  toast(msg);
  ctx.save();
  if (ctx.tab === 'base') { Hideout.refresh(ctx); if (ev.some((x) => x.t === 'den')) render(); }
  $('#topbar') && ($('#topbar').innerHTML = topbar());
}

// ---------------------------------------------------------------- input
const GLOBAL_ACTIONS = {
  nav: (c, el) => c.go(el.dataset.tab),
  closeModal: (c, el) => { if (el && el.dataset && el.dataset.then) c.sub.afterBattle = el.dataset.then; closeModal(); },
  toggleMute: () => { Audio.toggleMute(); render(); },
};
function unlockAudio() { Audio.unlock(); syncBattleMute(); }
document.addEventListener('pointerdown', unlockAudio, { once: true, capture: true });

document.getElementById('app').addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.hasAttribute('disabled')) return;
  const act = el.dataset.act;
  if (act !== 'toggleMute') Audio.play('tap');
  const handler = GLOBAL_ACTIONS[act] || SCREENS[ctx.tab].actions?.[act] || Shop.actions[act] || Crew.actions[act] || Hideout.actions[act];
  if (handler) { handler(ctx, el, e); ctx.save(); }
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
  toast('Welcome to the wasteland. Tap BUILD to put up your first Knock-off Stall.');
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
  setInterval(loop, 200);
  setInterval(() => ctx.save(), 5000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) ctx.save();
    else if (ctx.state) { const sum = E.applyOffline(ctx.state, ctx.now()); render(); welcomeBack(sum); }
  });
  window.addEventListener('pagehide', () => ctx.save());
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (ctx.tab === 'battle' && !ctx.sub.battle?.busy) render(); }, 150); });
}

splash(boot);
