// Battle screen renderer. All rules come from core/battle.js; this file draws the board,
// turns taps into actions, and animates the events those actions return.
import { GANGS, SPECIES, ROLES, GEAR } from '../core/data.js';
import * as B from '../core/battle.js';
import { aiNextAction } from '../core/ai.js';
import * as M from '../core/meta.js';
import { fmt, money, esc, rewardText } from './fmt.js';

const ui = (ctx) => (ctx.sub.battle ||= { sel: null, mode: 'shot', busy: false });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const D = (ctx, ms) => (ctx.fast ? Math.min(ms, 20) : ms);

function selected(ctx) {
  const b = ctx.state.battle, u = ui(ctx);
  let s = u.sel && B.unitById(b, u.sel);
  if (!s || !s.alive || s.side !== 'player') {
    s = B.living(b, 'player').find((x) => x.ap > 0) || B.living(b, 'player')[0];
    u.sel = s?.uid || null;
  }
  return s;
}

function targetsFor(ctx, b, s) {
  const u = ui(ctx);
  const out = new Map(); // key -> {kind, p}
  if (!s || b.side !== 'player' || b.status !== 'active') return out;
  const mode = u.mode;
  if (mode === 'shot' || mode === 'aimed' || mode === 'suppress' || mode === 'throw') {
    for (const t of B.living(b, 'enemy')) {
      const p = B.attackPreview(b, s, t, mode === 'throw' ? 'throw' : mode);
      if (p && p.cost <= s.ap) out.set(`${t.x},${t.y}`, { kind: 'target', p, t });
    }
  }
  if (mode === 'patch' || mode === 'heal') {
    for (const a of B.living(b, 'player')) if (B.dist(a, s) <= 1 && a.hp < a.maxHp) out.set(`${a.x},${a.y}`, { kind: 'heal', t: a });
  }
  return out;
}

function unitHtml(b, u, sel, tgt) {
  const st = [u.status.poison ? '☠' : '', u.status.smoke ? '💨' : '', u.status.suppressed ? '⬇' : ''].join('');
  return `<div class="unit ${u.side} ${u.boss ? 'boss' : ''} ${sel ? 'sel' : ''} ${u.side === 'player' && b.side === 'player' && u.ap <= 0 ? 'done' : ''} ${u.alive ? '' : 'dead'}" data-uid="${u.uid}" style="left:${(u.x / B.W) * 100}%;top:${(u.y / B.H) * 100}%">
    <div class="tok" style="background-image:url(${u.boss ? 'assets/croc.jpg' : SPECIES[u.species].img})"></div>
    <div class="hp"><i style="width:${(u.hp / u.maxHp) * 100}%"></i></div>
    ${u.side === 'player' && b.side === 'player' ? `<div class="ap">${'<b></b>'.repeat(Math.max(0, u.ap))}</div>` : ''}
    ${tgt && tgt.kind === 'target' ? `<span class="hit ${tgt.p.covered ? 'cov' : ''}">${tgt.p.covered ? '🛡' : ''}${tgt.p.chance}%</span>` : ''}
    ${st ? `<span class="st">${st}</span>` : ''}
  </div>`;
}

export function render(ctx) {
  const s = ctx.state, b = s.battle;
  if (!b) return `<div class="card">No fight in progress.</div><button class="btn red block" data-act="nav" data-tab="city">Back to the city</button>`;
  const u = ui(ctx);
  const sel = selected(ctx);
  const myTurn = b.side === 'player' && b.status === 'active' && !u.busy;
  const reach = myTurn && sel && u.mode === 'shot' ? B.reachable(b, sel) : new Map();
  const tg = myTurn ? targetsFor(ctx, b, sel) : new Map();
  const cells = [];
  for (let y = 0; y < B.H; y++) for (let x = 0; x < B.W; x++) {
    const t = b.tiles[y * B.W + x], k = `${x},${y}`;
    const r = reach.get(k);
    const cls = ['cell', t === B.T.COVER ? 'cover' : t === B.T.WALL ? 'wall' : '', b.deco[y * B.W + x] === 3 ? 'deco3' : '',
      r ? 'reach' + (sel && r.cost > sel.ap - 2 ? ' far' : '') : '', tg.get(k)?.kind === 'target' ? 'target' : '', tg.get(k)?.kind === 'heal' ? 'heal' : ''].join(' ');
    const icon = t === B.T.COVER ? ['📦', '🚗', '🗑️'][b.deco[y * B.W + x] % 3] : '';
    cells.push(`<div class="${cls}" data-act="cell" data-x="${x}" data-y="${y}">${icon}</div>`);
  }
  const pg = GANGS[s.gang], eg = GANGS[b.enemyGang];
  const alive = (side) => B.living(b, side).length;
  const w = sel?.weapon;
  const melee = w?.kind === 'melee';
  const g = sel?.gadget;
  const role3 = sel?.role === 'doc' ? ['patch', '✚', 'Patch up', B.COST.patch, !sel.patched] : (sel?.role === 'shooter' || sel?.role === 'marksman') ? ['suppress', '💥', 'Suppress', B.COST.suppress, true] : ['none', '—', 'No skill', 0, false];
  const gadgetMode = g ? (g.effect === 'heal' ? 'heal' : g.effect === 'throw' ? 'throw' : 'instant') : null;
  const act = (mode, icon, label, cost, enabled) => `<button class="act ${u.mode === mode ? 'on' : ''}" data-act="bmode" data-mode="${mode}" ${myTurn && enabled && sel && sel.ap >= cost ? '' : 'disabled'}><span class="i">${icon}</span>${label}<span class="c">${cost ? cost + 'AP' : ''}</span></button>`;
  return `
  <div class="battle">
    <div class="vs">
      <div class="side" style="border-color:${pg.colour}"><span style="color:${pg.colour}">${pg.name}</span><br><span class="dim">${alive('player')} standing</span></div>
      <div class="mid"><div class="tiny dim">${esc(b.label)}</div><div class="turn">TURN ${b.turn}<span class="faint">/${B.MAX_TURNS}</span></div><div class="tiny ${b.side === 'player' ? 'red' : 'green'}">${b.side === 'player' ? 'YOUR MOVE' : 'ENEMY MOVE'} · ${b.weather === 'rain' ? '🌧 rain −10% hit' : b.weather === 'fog' ? '🌫 fog' : '🌙 clear'}</div></div>
      <div class="side e" style="border-color:${eg.colour}"><span style="color:${eg.colour}">${eg.name}</span><br><span class="dim">${alive('enemy')} standing</span></div>
    </div>
    <div class="blog" id="blog">${esc(b.log[b.log.length - 1] || '')}</div>
    <div class="board-wrap" id="boardwrap">
      <div class="board ${b.weather}">${cells.join('')}</div>
      ${b.units.filter((x) => x.alive).map((x) => unitHtml(b, x, sel && x.uid === sel.uid && myTurn, tg.get(`${x.x},${x.y}`))).join('')}
    </div>
    ${sel ? `<div class="bpanel">
      <div class="portrait rar-${sel.rarity}" data-act="nextUnit" style="background-image:url(${SPECIES[sel.species].img})"></div>
      <div class="col"><div class="row"><b class="h">${esc(sel.name)}</b><span class="tiny dim">${ROLES[sel.role].name} · L${sel.level}</span><span class="tiny" style="margin-left:auto;color:#6fa4ef">AP ${sel.ap}/${sel.maxAp}</span></div>
        <div class="bar"><i style="width:${(sel.hp / sel.maxHp) * 100}%"></i></div>
        <div class="tiny dim">HP ${sel.hp}/${sel.maxHp} · ${w.name} (DMG ${w.dmg}, range ${w.range})${g ? ` · ${g.name}${sel.gadgetUsed ? ' (used)' : ''}` : ''}</div>
        <div class="tiny faint">${myTurn ? (u.mode === 'shot' ? 'Tap a blue tile to move, a red-ringed enemy to attack. Tap your portrait for the next fighter.' : 'Pick a highlighted target.') : 'Rivals are moving…'}</div></div>
    </div>` : ''}
    <div class="actions">
      ${act('shot', melee ? '✊' : '🔫', melee ? 'Strike' : 'Snap shot', B.COST.shot, true)}
      ${act('aimed', '🎯', 'Aimed shot', B.COST.aimed, !melee)}
      ${act(role3[0], role3[1], role3[2], role3[3], role3[4])}
      ${g ? act(gadgetMode === 'instant' ? 'instant' : gadgetMode, '🧪', g.name.split(' ')[0], B.COST.gadget, !sel.gadgetUsed) : act('nogadget', '🧪', 'No gadget', 0, false)}
      <button class="act end" data-act="endTurn" ${myTurn ? '' : 'disabled'}><span class="i">⟳</span>End turn</button>
    </div>
    <div class="row" style="justify-content:space-between"><button class="btn sm ghost" data-act="retreat">🏳 Retreat</button><span class="tiny faint">${b.kind === 'raid' ? 'Raid: win to steal their stash' : 'Turf war'}</span></div>
  </div>`;
}

export function mount(ctx) {
  const b = ctx.state.battle;
  if (!b) return;
  if (b.status === 'done') finish(ctx);
  else if (b.side === 'enemy' && !ui(ctx).busy) runAI(ctx);
}

// ---------------------------------------------------------------- animation
function boardPoint(x, y) {
  const wrap = document.getElementById('boardwrap');
  if (!wrap) return { x: 0, y: 0 };
  return { x: ((x + 0.5) / B.W) * wrap.clientWidth, y: ((y + 0.5) / B.H) * wrap.clientHeight };
}
function pop(text, x, y, cls = '') {
  const wrap = document.getElementById('boardwrap');
  if (!wrap) return;
  const p = boardPoint(x, y);
  const d = document.createElement('div');
  d.className = 'dmg ' + cls; d.textContent = text;
  d.style.left = p.x + 'px'; d.style.top = p.y - 18 + 'px';
  wrap.appendChild(d);
  setTimeout(() => d.remove(), 1000);
}
function shotLine(a, t) {
  const wrap = document.getElementById('boardwrap');
  if (!wrap) return;
  const p1 = boardPoint(a.x, a.y), p2 = boardPoint(t.x, t.y);
  const l = document.createElement('div');
  l.className = 'shotline';
  const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  l.style.left = p1.x + 'px'; l.style.top = p1.y + 'px'; l.style.width = len + 'px';
  l.style.transform = `rotate(${Math.atan2(p2.y - p1.y, p2.x - p1.x)}rad)`;
  wrap.appendChild(l);
  setTimeout(() => l.remove(), 300);
}
const unitEl = (uid) => document.querySelector(`.unit[data-uid="${uid}"]`);

async function play(ctx, events) {
  const b = ctx.state.battle;
  for (const ev of events) {
    if (ev.type === 'move') {
      const el = unitEl(ev.uid);
      for (const [x, y] of ev.path) { if (el) { el.style.left = (x / B.W) * 100 + '%'; el.style.top = (y / B.H) * 100 + '%'; } await sleep(D(ctx, 140)); }
    } else if (ev.type === 'attack') {
      const a = B.unitById(b, ev.uid), t = B.unitById(b, ev.target);
      if (!ev.melee) shotLine(a, t);
      else { const el = unitEl(ev.uid); if (el) { el.classList.add('shake'); setTimeout(() => el.classList.remove('shake'), 300); } }
      await sleep(D(ctx, 120));
      if (ev.hit) {
        pop(`${ev.crit ? 'CRIT ' : ''}-${ev.dmg}`, t.x, t.y, ev.crit ? 'crit' : '');
        const el = unitEl(ev.target);
        if (el) { el.classList.add('shake'); const hp = el.querySelector('.hp i'); if (hp) hp.style.width = (t.hp / t.maxHp) * 100 + '%'; if (ev.kill) setTimeout(() => el.classList.add('dead'), 250); }
      } else pop('MISS', t.x, t.y, 'miss');
      await sleep(D(ctx, 420));
    } else if (ev.type === 'heal') {
      const t = B.unitById(b, ev.target); pop(`+${ev.amt}`, t.x, t.y, 'heal'); await sleep(D(ctx, 350));
    } else if (ev.type === 'buff' || ev.type === 'suppress') {
      const t = B.unitById(b, ev.type === 'suppress' ? ev.target : ev.uid); pop(ev.type === 'suppress' ? 'PINNED' : ev.text, t.x, t.y, 'miss'); await sleep(D(ctx, 350));
    } else if (ev.type === 'poison') {
      const t = B.unitById(b, ev.target); pop(`☠ -${ev.dmg}`, t.x, t.y); await sleep(D(ctx, 300));
    } else if (ev.type === 'turn') {
      const blog = document.getElementById('blog');
      if (blog) blog.innerHTML = `<b class="${ev.side === 'player' ? 'red' : 'green'}">${ev.side === 'player' ? 'YOUR TURN' : 'RIVALS MOVE'}</b>`;
      await sleep(D(ctx, 350));
    }
    const blog = document.getElementById('blog');
    if (blog && ev.type !== 'turn') blog.textContent = b.log[b.log.length - 1] || '';
  }
}

async function doAction(ctx, action) {
  const u = ui(ctx);
  if (u.busy) return;
  const b = ctx.state.battle;
  const r = B.applyAction(b, action);
  if (!r.ok) { ctx.toast('Not possible'); return; }
  u.busy = true;
  ctx.save();
  await play(ctx, r.ev);
  u.busy = false;
  if (b.status === 'done') return finish(ctx);
  const sel = B.unitById(b, u.sel);
  if (sel && sel.ap <= 0) { const nx = B.living(b, 'player').find((x) => x.ap > 0); if (nx) u.sel = nx.uid; }
  u.mode = 'shot';
  ctx.render();
}

async function runAI(ctx) {
  const u = ui(ctx);
  const b = ctx.state.battle;
  u.busy = true;
  ctx.render();
  await sleep(D(ctx, 300));
  let guard = 0;
  while (b.status === 'active' && b.side === 'enemy' && guard++ < 200) {
    const a = aiNextAction(b) || { type: 'end' };
    let r = B.applyAction(b, a);
    if (!r.ok) r = B.applyAction(b, { type: 'end' });
    await play(ctx, r.ev);
    ctx.save();
    if (a.type === 'end') break;
  }
  u.busy = false;
  u.mode = 'shot';
  u.sel = null;
  if (b.status === 'done') return finish(ctx);
  ctx.render();
}

function finish(ctx) {
  const res = M.resolveBattle(ctx.state, ctx.now());
  ctx.save();
  if (!res) return;
  ctx.sub.battle = null;
  const parts = [];
  if (res.cash) parts.push(`<span>${money(res.cash)}</span>`);
  if (res.influence) parts.push(`<span>🐾 ${res.influence}</span>`);
  if (res.teeth) parts.push(`<span>🦷 ${res.teeth}</span>`);
  if (res.rep) parts.push(`<span>${res.rep > 0 ? '+' : ''}${res.rep} rep</span>`);
  if (res.gear) parts.push(`<span>🎒 ${gearName(res.gear)}</span>`);
  ctx.modal(`<div class="result ${res.win ? 'win' : 'loss'}">
    <div class="h dim">${esc(res.label)}</div>
    <div class="big">${res.win ? 'Victory' : res.reason === 'retreat' ? 'Retreated' : res.reason === 'timeout' ? 'Out of time' : 'Defeat'}</div>
    ${res.district ? `<div class="h gold">District taken! Income bonus applied.</div>` : ''}
    <div class="rewards">${parts.join('')}</div>
    ${res.win ? '' : '<div class="small dim">Train your crew and buy better gear in the Armoury, then try again.</div>'}
    <button class="btn red block" style="margin-top:10px" data-act="closeModal">Back to the city</button></div>`, { center: true, backdrop: false, onClose: () => ctx.go('city') });
}
const gearName = (id) => GEAR[id]?.name || id;

// ---------------------------------------------------------------- input
export const actions = {
  cell(ctx, el) {
    const b = ctx.state.battle, u = ui(ctx);
    if (!b || u.busy || b.side !== 'player' || b.status !== 'active') return;
    const x = +el.dataset.x, y = +el.dataset.y;
    const sel = selected(ctx);
    const occ = B.unitAt(b, x, y);
    const tg = targetsFor(ctx, b, sel).get(`${x},${y}`);
    if (tg && tg.kind === 'heal') return doAction(ctx, u.mode === 'patch' ? { type: 'patch', uid: sel.uid, target: tg.t.uid } : { type: 'gadget', uid: sel.uid, target: tg.t.uid });
    if (occ && occ.side === 'player') { u.sel = occ.uid; u.mode = 'shot'; return ctx.render(); }
    if (occ && occ.side === 'enemy') {
      if (tg) {
        if (u.mode === 'suppress') return doAction(ctx, { type: 'suppress', uid: sel.uid, target: occ.uid });
        return doAction(ctx, { type: 'attack', uid: sel.uid, target: occ.uid, mode: u.mode === 'throw' ? 'throw' : u.mode });
      }
      const p = sel && B.attackPreview(b, sel, occ, u.mode === 'aimed' ? 'aimed' : 'shot');
      return ctx.toast(`${occ.name}: ${ROLES[occ.role].name}, HP ${occ.hp}/${occ.maxHp}, ${occ.weapon.name}. ${p ? `Need ${p.cost} AP` : 'Out of range or no line of sight'}`);
    }
    if (u.mode === 'shot' && sel && B.reachable(b, sel).has(`${x},${y}`)) return doAction(ctx, { type: 'move', uid: sel.uid, x, y });
    if (u.mode !== 'shot') { u.mode = 'shot'; ctx.render(); }
  },
  bmode(ctx, el) {
    const u = ui(ctx), b = ctx.state.battle;
    const mode = el.dataset.mode;
    const sel = selected(ctx);
    if (mode === 'instant') return doAction(ctx, { type: 'gadget', uid: sel.uid });
    u.mode = u.mode === mode && mode !== 'shot' ? 'shot' : mode;
    ctx.render();
    if (u.mode !== 'shot' && !targetsFor(ctx, b, sel).size) ctx.toast('No valid targets from here');
  },
  nextUnit(ctx) {
    const b = ctx.state.battle, u = ui(ctx);
    const l = B.living(b, 'player');
    const i = l.findIndex((x) => x.uid === u.sel);
    u.sel = l[(i + 1) % l.length].uid; u.mode = 'shot';
    ctx.render();
  },
  endTurn(ctx) {
    const u = ui(ctx);
    if (u.busy) return;
    const b = ctx.state.battle;
    const r = B.applyAction(b, { type: 'end' });
    ctx.save();
    play(ctx, r.ev).then(() => (b.status === 'done' ? finish(ctx) : runAI(ctx)));
  },
  retreat(ctx) {
    ctx.modal(`<div class="h" style="font-size:22px">Retreat?</div><p class="dim">You lose this fight${ctx.state.battle?.kind === 'raid' ? ' and 15 rep' : ''}. Your crew walks away to fight another day.</p>
      <button class="btn red block" data-act="confirmRetreat">Retreat</button>`, { center: true });
  },
  confirmRetreat(ctx) { ctx.closeModal(true); B.retreat(ctx.state.battle); finish(ctx); },
};
