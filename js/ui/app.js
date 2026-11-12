// UI controller: owns the state object, the clock, persistence and screen routing.
// Rules live in js/core/*; this layer only renders and forwards player intents.
import { GAME, GANGS, SPECIES } from '../core/data.js';
import { newGame, makeLocalStorage } from '../core/state.js';
import * as E from '../core/economy.js';
import * as C from '../core/crew.js';
import * as M from '../core/meta.js';
import { fmt, money, dur, esc } from './fmt.js';
import * as Empire from './empire.js';
import * as Crew from './crew.js';
import * as City from './city.js';
import * as Jobs from './jobs.js';
import * as Shop from './shop.js';
import * as Battle from './battle.js';

const params = new URLSearchParams(location.search);
const storage = makeLocalStorage(window.localStorage);
if (params.has('reset')) storage.clear();

const SCREENS = { empire: Empire, crew: Crew, city: City, jobs: Jobs, shop: Shop, battle: Battle };
const NAV = [
  ['empire', '🏚️', 'Hideout'], ['crew', '🐾', 'Crew'], ['city', '📍', 'City'], ['jobs', '💼', 'Jobs'], ['shop', '⚖️', 'Market'],
];

export const ctx = {
  state: null,
  tab: 'empire',
  sub: {},              // per-screen UI-only state (not saved)
  fast: params.has('fast'),
  timeOffset: 0,        // debug: shift the clock to test offline earnings
  now() { return Date.now() + this.timeOffset; },
  save() { if (this.state) storage.save(this.state); },
  go(tab) { this.tab = tab; this.render(); document.getElementById('screen').scrollTop = 0; },
  render, toast, modal, closeModal, floaty, live,
  fmt, money, dur, esc,
};
window.__game = ctx; // exposed for automated tests and debugging

const $ = (sel, root = document) => root.querySelector(sel);

function topbar() {
  const s = ctx.state, now = ctx.now();
  const vip = E.isVip(s, now) ? '<span class="vipbadge">MADE</span>' : '';
  return `
    <div class="res cash"><span class="ico">👑</span><b data-live="cash">${money(s.cash)}</b>${vip}</div>
    <div class="res inf"><span class="ico">🐾</span><b data-live="influence">${fmt(Math.floor(s.influence))}</b></div>
    <div class="res teeth" data-act="nav" data-tab="shop"><span class="ico">🦷</span><b data-live="teeth">${fmt(s.teeth)}</b><span class="plus">+</span></div>`;
}

function nav() {
  const s = ctx.state, now = ctx.now();
  const dot = {
    jobs: !M.dailyStatus(s, now).claimedToday || s.jobs.list.some((j) => !j.claimed && M.jobProgress(s, j).done),
    crew: s.training.some((t) => t.endsAt <= now),
    empire: !!(M.currentObjective(s)?.done),
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
  $('#nav').innerHTML = nav();
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
  SCREENS[ctx.tab].live?.(ctx, now);
}

// ---------------------------------------------------------------- overlays
let modalEl = null;
function modal(html, { center = false, onClose, closable = true, backdrop = true } = {}) {
  closeModal(true);
  modalEl = document.createElement('div');
  modalEl.className = 'overlay' + (center ? ' center' : '');
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

// ---------------------------------------------------------------- input
const GLOBAL_ACTIONS = {
  nav: (c, el) => c.go(el.dataset.tab),
  closeModal: () => closeModal(),
};
document.getElementById('app').addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.hasAttribute('disabled')) return;
  const act = el.dataset.act;
  const handler = GLOBAL_ACTIONS[act] || SCREENS[ctx.tab].actions?.[act] || Shop.actions[act] || Crew.actions[act];
  if (handler) { handler(ctx, el, e); ctx.save(); }
});

// ---------------------------------------------------------------- boot
function welcomeBack(sum) {
  if (!sum) return;
  modal(`
    <div class="result win"><div class="h dim">While you were away (${dur(sum.seconds)})</div>
    <div class="big">${money(sum.banked + sum.tills)}</div>
    <div class="dim small">${money(sum.banked)} banked by your lieutenants${sum.tills > 0 ? ` · ${money(sum.tills)} waiting in tills` : ''}${sum.influence >= 1 ? ` · 🐾 ${fmt(Math.floor(sum.influence))} from turf` : ''}</div>
    ${sum.cappedSeconds < sum.seconds ? `<div class="tiny faint" style="margin-top:6px">Offline earnings cap at ${dur(sum.cappedSeconds)}. Made Members get 12h.</div>` : ''}
    <div class="row" style="margin-top:14px">
      <button class="btn block" data-act="closeModal">Collect</button>
      ${sum.banked > 0 ? `<button class="btn gold block" data-act="doubleOffline">▶ Double it (ad)</button>` : ''}
    </div></div>`, { center: true });
  GLOBAL_ACTIONS.doubleOffline = (c) => { const v = E.doubleOffline(c.state, sum); closeModal(); toast(`Ad watched (mock): +${money(v)}`); render(); };
}

function chooseGang() {
  let pick = 'grey';
  $('#screen').innerHTML = '<div class="hero" style="height:46vh"></div>';
  const draw = () => `
    <div class="h" style="font-size:22px">Pick your gang</div>
    <div class="dim small" style="margin:4px 0 10px">Your gang sets your starting crew. You can recruit any animal later.</div>
    <div class="gangpick">${Object.entries(GANGS).map(([id, g]) => `
      <button class="gangcard ${pick === id ? 'on' : ''}" data-act="pickGang" data-id="${id}">
        <div class="im" style="background-image:url(${SPECIES[g.species[0]].img})"></div>
        <div class="tx"><div class="h" style="color:${g.colour}">${g.name}</div><div class="tiny dim">${g.blurb}</div></div>
      </button>`).join('')}</div>
    <button class="btn red block" style="margin-top:12px" data-act="startGame">Take the streets</button>`;
  const m = modal(draw(), { closable: false });
  GLOBAL_ACTIONS.pickGang = (c, el) => { pick = el.dataset.id; m.querySelector('.sheet').innerHTML = draw(); };
  GLOBAL_ACTIONS.startGame = () => {
    ctx.state = newGame(ctx.now(), pick);
    M.ensureJobs(ctx.state, ctx.now());
    closeModal(true); ctx.save(); render();
    toast('Tap SHAKE DOWN to make your first cash');
  };
}

function splash(next) {
  const sp = document.createElement('div');
  sp.className = 'splash';
  sp.innerHTML = `<div class="logo">Fang<br><span>City</span></div>
    <div class="h dim" style="letter-spacing:.2em;margin:6px 0 18px">Animal Gangs · prototype ${GAME.version}</div>
    <button class="btn red block" id="play">Play</button>
    <div class="tiny faint" style="margin-top:10px;text-align:center">Concept prototype. No real payments.</div>`;
  $('#app').appendChild(sp);
  const go = () => { sp.remove(); next(); };
  sp.querySelector('#play').addEventListener('click', go);
  if (ctx.fast) go();
}

function loop() {
  const s = ctx.state;
  if (s) {
    const now = ctx.now();
    const dt = Math.min(5, Math.max(0, (now - s.lastTick) / 1000));
    E.tick(s, dt, now);
    const done = C.finishTraining(s, now);
    if (done.length) { toast(`${done.map((m) => m.name).join(', ')} finished training: level ${done[0].level}`); if (ctx.tab === 'crew' || ctx.tab === 'empire') render(); else $('#nav').innerHTML = nav(); }
    live();
  }
}

function boot() {
  const now = ctx.now();
  const saved = storage.load();
  if (saved) {
    ctx.state = saved;
    const sum = E.applyOffline(saved, now);
    C.finishTraining(saved, now);
    M.ensureJobs(saved, now);
    render();
    welcomeBack(sum);
  } else {
    render.call(null);
    chooseGang();
  }
  setInterval(loop, 200);
  setInterval(() => ctx.save(), 5000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) ctx.save();
    else if (ctx.state) { const sum = E.applyOffline(ctx.state, ctx.now()); render(); welcomeBack(sum); }
  });
  window.addEventListener('pagehide', () => ctx.save());
}

splash(boot);
