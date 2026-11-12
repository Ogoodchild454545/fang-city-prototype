// Battle screen renderer. All rules come from core/battle.js; this file draws the board,
// turns taps into actions, and animates the events those actions return.
import { GANGS, SPECIES, ROLES, GEAR, TROOPS, BOSSES } from '../core/data.js';
import * as B from '../core/battle.js';
import { aiNextAction } from '../core/ai.js';
import * as M from '../core/meta.js';
import { fmt, money, esc, rewardText } from './fmt.js';
import { spriteFor } from '../core/buildings.js';
import { SPR } from './iso.js';

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
  if (mode === 'roll') {
    for (const t of B.living(b, 'enemy')) if (B.dist(t, s) === 1) out.set(`${t.x},${t.y}`, { kind: 'target', p: { chance: 100, covered: false }, t });
  }
  if (mode === 'patch' || mode === 'heal') {
    for (const a of B.living(b, 'player')) if (B.dist(a, s) <= 1 && a.hp < a.maxHp) out.set(`${a.x},${a.y}`, { kind: 'heal', t: a });
  }
  return out;
}

// ---------------------------------------------------------------- isometric geometry
// tile (x, y) -> board px. x runs down-right (attackers start on the upper-left edge), y runs up-right.
let G = { cw: 60, ch: 30, pad: 50, w: 10, h: 7 };
function geometry(b) {
  const availW = Math.max(300, window.innerWidth - 236 - 30);
  const availH = Math.max(200, window.innerHeight - 44);
  const n = (b.w + b.h) / 2;
  const cw = Math.floor(Math.min(availW / n, availH / (n / 2 + 0.9)));
  G = { cw, ch: cw / 2, pad: Math.round(cw * 0.9), w: b.w, h: b.h };
  return G;
}
const cx = (x, y) => (x + y + 1) * G.cw / 2;
const cy = (x, y) => G.pad + (G.h - y + x) * G.ch / 2;
function unitPos(u) {
  if (u.structure) { const s = u.size; return { x: cx(u.fx + (s - 1) / 2, u.fy + (s - 1) / 2), y: cy(u.fx + (s - 1) / 2, u.fy + (s - 1) / 2) }; }
  return { x: cx(u.x, u.y), y: cy(u.x, u.y) };
}
const structAt = (b, x, y) => b.units.find((u) => u.alive && u.structure && x >= u.fx && x < u.fx + u.size && y >= u.fy && y < u.fy + u.size);
const COVER_SPR = ['tyres', 'scrap', 'rubble'];

function propHtml(t, lv, fx, fy, size, extra = '') {
  const name = spriteFor(t, lv);
  const tw = SPR[name] || { w: 1 };
  const bx = cx(fx + size - 1, fy), by = cy(fx + size - 1, fy) + G.ch / 2;
  const w = size * G.cw * tw.w * (size > 1 ? 0.9 : 1);
  return `<img class="iprop ${extra.includes('data-w') ? 'wrecked' : ''}" ${extra} src="assets/base/${name}.webp" alt="" style="left:${bx}px;top:${by}px;width:${w}px;transform:translate(-50%,calc(-100% + ${(tw.dy || 0) * G.ch * size}px));z-index:${Math.round(by)}">`;
}

function unitHtml(b, u, sel, tgt) {
  const p = unitPos(u);
  const st = [u.status.poison ? '☠' : '', u.status.smoke ? '💨' : '', u.status.suppressed ? '⬇' : ''].join('');
  const z = Math.round(p.y + G.ch / 2) + (u.structure ? 1400 : 1000); // fighters always read above buildings
  const hit = tgt && tgt.kind === 'target' ? `<span class="hit ${tgt.p.covered ? 'cov' : ''}">${tgt.p.covered ? '🛡' : ''}${tgt.p.chance}%</span>` : '';
  if (u.structure) {
    const icon = u.weapon ? '🎯' : u.loot && (u.loot.cash || u.loot.influence) ? '💰' : u.kind === 'den' ? '🏚' : '';
    return `<div class="unit struct ${tgt ? 'tg' : ''}" data-uid="${u.uid}" data-act="cell" data-x="${u.x}" data-y="${u.y}" style="left:${p.x}px;top:${p.y}px;z-index:${z};--sy:${-Math.round(u.size * G.cw * 0.62)}px;pointer-events:auto">
      <span class="sic">${icon}</span><div class="hp"><i style="width:${(u.hp / u.maxHp) * 100}%"></i></div>${hit}</div>`;
  }
  return `<div class="unit ${u.side} ${u.boss ? 'boss' : ''} ${sel ? 'sel' : ''} ${u.side === 'player' && b.side === 'player' && u.ap <= 0 ? 'done' : ''} ${u.alive ? '' : 'dead'}" data-uid="${u.uid}" style="left:${p.x}px;top:${p.y}px;z-index:${z}">
    <div class="tok" style="background-image:url(${unitImg(u)})"></div>
    <div class="hp"><i style="width:${(u.hp / u.maxHp) * 100}%"></i></div>
    ${u.side === 'player' && b.side === 'player' ? `<div class="ap">${'<b></b>'.repeat(Math.max(0, u.ap))}</div>` : ''}
    ${hit}${st ? `<span class="st">${st}</span>` : ''}
  </div>`;
}

const unitImg = (u) => u.img || (u.boss ? 'assets/croc.jpg' : SPECIES[u.species].img);
const PLAYER_SIDE = { name: 'Your Crew', colour: '#c9302c' };
const starRow = (n) => `<span class="stars">${[0, 1, 2].map((i) => (i < n ? '★' : '<span class="off">★</span>')).join('')}</span>`;

export function render(ctx) {
  const s = ctx.state, b = s.battle;
  if (!b) return `<div class="card">No fight in progress.</div><button class="btn red block" data-act="nav" data-tab="city">Back to the city</button>`;
  geometry(b);
  const u = ui(ctx);
  const sel = selected(ctx);
  const myTurn = b.side === 'player' && b.status === 'active' && !u.busy;
  const reach = myTurn && sel && u.mode === 'shot' ? B.reachable(b, sel) : new Map();
  const tg = myTurn ? targetsFor(ctx, b, sel) : new Map();
  const cells = [], decor = [];
  const propAt = new Set();
  for (const pr of b.props || []) for (let j = pr.fy; j < pr.fy + pr.size; j++) for (let i = pr.fx; i < pr.fx + pr.size; i++) propAt.add(j * b.w + i);
  const raid = b.kind === 'raid';
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
    const k = `${x},${y}`, i = y * b.w + x, t = b.tiles[i];
    const r = reach.get(k);
    const tk = tg.get(k);
    const cls = ['icell', (x + y) % 2 ? 'alt' : '', x < 2 ? 'dep' : '', t === B.T.COVER ? 'cover' : t === B.T.WALL ? 'wall' : '',
      r ? 'reach' + (sel && r.cost > sel.ap - 2 ? ' far' : '') : '', tk?.kind === 'target' ? 'target' : '', tk?.kind === 'heal' ? 'heal' : ''].join(' ');
    cells.push(`<div class="${cls}" data-act="cell" data-x="${x}" data-y="${y}" style="left:${cx(x, y) - G.cw / 2}px;top:${cy(x, y) - G.ch / 2}px;width:${G.cw}px;height:${G.ch}px"></div>`);
    if (!propAt.has(i)) {
      if (t === B.T.COVER) decor.push(propHtml(COVER_SPR[b.deco[i] % 3], 1, x, y, 1));
      else if (t === B.T.WALL) decor.push(propHtml('wall', 1, x, y, 1));
    }
  }
  for (const pr of b.props || []) {
    const su = b.units.find((x) => x.structure && x.fx === pr.fx && x.fy === pr.fy);
    decor.push(propHtml(pr.t, pr.lv, pr.fx, pr.fy, pr.size, su ? `data-suid="${su.uid}" ${su.alive ? '' : 'data-w="1"'}` : ''));
  }
  const pg = PLAYER_SIDE, eg = GANGS[b.enemyGang];
  const alive = (side) => B.combatants(b, side).filter((x) => !x.structure).length;
  const w = sel?.weapon;
  const melee = w?.kind === 'melee';
  const g = sel?.gadget;
  const role3 = sel?.role === 'doc' ? ['patch', '✚', 'Patch up', B.COST.patch, !sel.patched] : (sel?.role === 'shooter' || sel?.role === 'marksman') ? ['suppress', '💥', 'Suppress', B.COST.suppress, true] : ['none', '—', 'No skill', 0, false];
  const gadgetMode = g ? (g.effect === 'heal' ? 'heal' : g.effect === 'throw' ? 'throw' : 'instant') : null;
  const act = (mode, icon, label, cost, enabled) => `<button class="act ${u.mode === mode ? 'on' : ''}" data-act="bmode" data-mode="${mode}" ${myTurn && enabled && sel && sel.ap >= cost ? '' : 'disabled'}><span class="i">${icon}</span>${label}<span class="c">${cost ? cost + 'AP' : ''}</span></button>`;
  const rs = raid ? B.raidStars(b) : null;
  const bw = (b.w + b.h) * G.cw / 2, bh = G.pad + (b.w + b.h) * G.ch / 2;
  return `
  <div class="battle">
    <div class="bhead"><span class="h small">${esc(b.label)}</span><span class="tiny ${b.side === 'player' ? 'red' : 'green'} h">T${b.turn}/${B.MAX_TURNS} · ${b.side === 'player' ? 'your move' : 'enemy move'}</span>
      <span class="tiny dim">${b.weather === 'rain' ? '🌧 rain −10% hit' : b.weather === 'fog' ? '🌫 fog' : '🌙 clear'}</span><div class="blog" id="blog">${esc(b.log[b.log.length - 1] || '')}</div></div>
    <div class="bstage" ${b.meta && b.meta.bg ? `style="background-image:linear-gradient(rgba(10,8,8,.72),rgba(10,8,8,.88)),url(${b.meta.bg})"` : ''}><div class="iboard ${b.weather}" id="boardwrap" style="width:${bw}px;height:${bh}px;--cw:${G.cw}px;--ch:${G.ch}px">
      ${cells.join('')}${decor.join('')}
      ${b.units.filter((x) => x.alive).map((x) => unitHtml(b, x, sel && x.uid === sel.uid && myTurn, tg.get(`${x.x},${x.y}`))).join('')}
    </div></div>
    <div class="bside">
      <div class="vs">
        <div class="side" style="border-color:${pg.colour}"><span style="color:${pg.colour}">${pg.name}</span><br><span class="dim">${alive('player')} up</span></div>
        <div class="mid tiny h">vs</div>
        <div class="side e" style="border-color:${eg.colour}"><span style="color:${eg.colour}">${eg.name}</span><br><span class="dim">${alive('enemy')} up${raid ? ` · ${B.combatants(b, 'enemy').filter((x) => x.structure).length}🎯` : ''}</span></div>
      </div>
      ${raid ? `<div class="lootbar"><span>Loot <b class="gold" id="lootc">${money(b.looted.cash)}</b>${b.looted.influence ? ` · 🐾 ${fmt(b.looted.influence)}` : ''}</span><span id="starsnow">${starRow(rs.stars)}</span></div>
        <div class="tiny faint">Wreck The Den to win and take everything left. Strongboxes and Ledgers pay out when destroyed. Turrets 🎯 shoot back.</div>` : ''}
      ${sel ? `<div class="bpanel">
        <div class="portrait rar-${sel.rarity}" data-act="nextUnit" style="background-image:url(${unitImg(sel)})"></div>
        <div class="col"><div class="row"><b class="h small">${esc(sel.troop ? TROOPS[sel.troop].name : sel.name)}${sel.troop ? ` <span class="tiny dim">lv ${sel.troopLv}</span>` : ''}</b><span class="tiny" style="margin-left:auto;color:#6fa4ef">AP ${sel.ap}/${sel.maxAp}</span></div>
          <div class="bar"><i style="width:${(sel.hp / sel.maxHp) * 100}%"></i></div>
          <div class="tiny dim">HP ${sel.hp}/${sel.maxHp} · ${w.name} (${w.dmg} dmg, rng ${w.range})${g ? ` · ${g.name}${sel.gadgetUsed ? ' (used)' : ''}` : ''}</div></div>
      </div>
      <div class="tiny faint">${myTurn ? (u.mode === 'shot' ? 'Blue tile: move. Red ring: attack. Tap the portrait for the next fighter.' : 'Pick a highlighted target.') : 'Rivals are moving…'}</div>` : ''}
      <div class="actions">
        ${act('shot', melee ? '✊' : '🔫', melee ? 'Strike' : 'Snap shot', B.COST.shot, true)}
        ${act('aimed', '🎯', 'Aimed', B.COST.aimed, !melee)}
        ${act(role3[0], role3[1], role3[2], role3[3], role3[4])}
        ${sel?.skill ? act(sel.skill === 'howl' ? 'howl' : 'roll', '⭐', BOSSES[sel.bossId].skillName, B.COST.skill, !sel.skillUsed) : g ? act(gadgetMode === 'instant' ? 'instant' : gadgetMode, '🧪', g.name.split(' ')[0], B.COST.gadget, !sel.gadgetUsed) : act('nogadget', '🧪', 'No gadget', 0, false)}
        <button class="act end" style="grid-column:span 2" data-act="endTurn" ${myTurn ? '' : 'disabled'}><span class="i">⟳</span>End turn</button>
      </div>
      <button class="btn sm ghost" data-act="retreat">🏳 Retreat</button>
    </div>
  </div>`;
}

export function mount(ctx) {
  const b = ctx.state.battle;
  if (!b) return;
  if (b.status === 'done') finish(ctx);
  else if (b.side === 'enemy' && !ui(ctx).busy) runAI(ctx);
}

// ---------------------------------------------------------------- animation
function pointOf(u) { const p = unitPos(u); return u.structure ? { x: p.x, y: p.y - u.size * G.cw * 0.45 } : { x: p.x, y: p.y - G.cw * 0.3 }; }
function pop(text, t, cls = '') {
  const wrap = document.getElementById('boardwrap');
  if (!wrap) return;
  const p = pointOf(t);
  const d = document.createElement('div');
  d.className = 'dmg ' + cls; d.textContent = text;
  d.style.left = p.x + 'px'; d.style.top = p.y - 18 + 'px'; d.style.zIndex = 3000;
  wrap.appendChild(d);
  setTimeout(() => d.remove(), 1000);
}
function shotLine(a, t) {
  const wrap = document.getElementById('boardwrap');
  if (!wrap) return;
  const p1 = pointOf(a), p2 = pointOf(t);
  const l = document.createElement('div');
  l.className = 'shotline';
  const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  l.style.left = p1.x + 'px'; l.style.top = p1.y + 'px'; l.style.width = len + 'px';
  l.style.transform = `rotate(${Math.atan2(p2.y - p1.y, p2.x - p1.x)}rad)`; l.style.zIndex = 2999;
  wrap.appendChild(l);
  setTimeout(() => l.remove(), 300);
}
const unitEl = (uid) => document.querySelector(`.unit[data-uid="${uid}"]`);

async function play(ctx, events) {
  const b = ctx.state.battle;
  for (const ev of events) {
    if (ev.type === 'move') {
      const el = unitEl(ev.uid);
      for (const [x, y] of ev.path) { if (el) { el.style.left = cx(x, y) + 'px'; el.style.top = cy(x, y) + 'px'; el.style.zIndex = Math.round(cy(x, y) + G.ch / 2) + 1000; } await sleep(D(ctx, 140)); }
    } else if (ev.type === 'attack') {
      const a = B.unitById(b, ev.uid), t = B.unitById(b, ev.target);
      if (!ev.melee) shotLine(a, t);
      else { const el = unitEl(ev.uid); if (el) { el.classList.add('shake'); setTimeout(() => el.classList.remove('shake'), 300); } }
      await sleep(D(ctx, 120));
      if (ev.hit) {
        pop(`${ev.crit ? 'CRIT ' : ''}-${ev.dmg}`, t, ev.crit ? 'crit' : '');
        const el = unitEl(ev.target);
        if (el) { el.classList.add('shake'); const hp = el.querySelector('.hp i'); if (hp) hp.style.width = (t.hp / t.maxHp) * 100 + '%'; if (ev.kill) setTimeout(() => el.classList.add('dead'), 250); }
        if (ev.kill && t.structure) {
          document.querySelector(`.iprop[data-suid="${t.uid}"]`)?.classList.add('wrecked');
          if (t.loot && (t.loot.cash || t.loot.influence)) { await sleep(D(ctx, 200)); pop(`+${t.loot.cash ? money(t.loot.cash) : '🐾 ' + fmt(t.loot.influence)}`, t, 'heal'); }
          const lc = document.getElementById('lootc'); if (lc) lc.textContent = money(b.looted.cash);
          const sn = document.getElementById('starsnow'); if (sn) sn.innerHTML = starRow(B.raidStars(b).stars);
        }
      } else pop('MISS', t, 'miss');
      await sleep(D(ctx, 420));
    } else if (ev.type === 'heal') {
      const t = B.unitById(b, ev.target); pop(`+${ev.amt}`, t, 'heal'); await sleep(D(ctx, 350));
    } else if (ev.type === 'buff' || ev.type === 'suppress') {
      const t = B.unitById(b, ev.type === 'suppress' ? ev.target : ev.uid); pop(ev.type === 'suppress' ? 'PINNED' : ev.text, t, 'miss'); await sleep(D(ctx, 350));
    } else if (ev.type === 'poison') {
      const t = B.unitById(b, ev.target); pop(`☠ -${ev.dmg}`, t); await sleep(D(ctx, 300));
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
  if (res.kind === 'raid' && res.looted && (res.looted.cash || res.looted.influence)) parts.push(`<span>Stolen: ${money(res.looted.cash)}${res.looted.influence ? ` · 🐾 ${fmt(res.looted.influence)}` : ''}</span>`);
  const lc = (res.lost && res.lost.cash) || 0, li = (res.lost && res.lost.influence) || 0;
  if (res.kind === 'raid') {
    const bc = Math.max(0, (res.cash || 0) - lc), bi = Math.max(0, (res.influence || 0) - li);
    if (bc || bi) parts.push(`<span>Banked: ${bc ? money(bc) : ''}${bc && bi ? ' · ' : ''}${bi ? '🐾 ' + fmt(bi) : ''}</span>`);
  } else {
    if (res.cash) parts.push(`<span>${money(res.cash)}</span>`);
    if (res.influence) parts.push(`<span>🐾 ${res.influence}</span>`);
  }
  if (res.teeth) parts.push(`<span>🦷 ${res.teeth}</span>`);
  if (res.rep) parts.push(`<span>${res.rep > 0 ? '+' : ''}${res.rep} rep</span>`);
  const fallen = Object.entries(res.fallen || {});
  ctx.modal(`<div class="result ${res.win ? 'win' : 'loss'}">
    <div class="h dim">${esc(res.label)}</div>
    <div class="big">${res.win ? 'Victory' : res.reason === 'retreat' ? 'Retreated' : res.reason === 'timeout' ? 'Out of time' : 'Defeat'}</div>
    ${res.kind === 'raid' ? `<div>${starRow(res.stars || 0)}</div><div class="tiny dim">${res.pct}% of the base wrecked</div>` : ''}
    ${res.district ? `<div class="h gold">District taken! Income bonus applied.</div>` : ''}
    ${res.missionFirst ? `<div class="h gold">Mission cleared! The next one is open.</div>` : ''}
    ${res.lost && (res.lost.cash || res.lost.influence) ? `<div class="small red">Storage full: ${res.lost.cash ? money(res.lost.cash) : ''}${res.lost.cash && res.lost.influence ? ' and ' : ''}${res.lost.influence ? '🐾 ' + fmt(res.lost.influence) : ''} left behind. Build more Strongboxes/Ledgers.</div>` : ''}
    <div class="rewards">${parts.join('')}</div>
    <div class="tiny ${fallen.length ? 'red' : 'green'}" style="margin-top:6px">${fallen.length ? `Lost in the fight: ${fallen.map(([t, n]) => `${n}× ${TROOPS[t].name}`).join(', ')}. Retrain them in My Crew.` : 'No troops lost.'}${res.bossesDown && res.bossesDown.length ? ` ${res.bossesDown.join(' & ')} needs 10 minutes' rest.` : ''}</div>
    ${res.win ? '' : '<div class="small dim">Train more troops and upgrade them in the Armoury, then try again.</div>'}
    <div class="row" style="margin-top:10px"><button class="btn block" data-act="closeModal" data-then="crew">My Crew</button><button class="btn red block" data-act="closeModal">${res.kind === 'mission' ? 'Back to missions' : 'Back to the city'}</button></div></div>`, { center: true, backdrop: false, onClose: () => ctx.go(ctx.sub.afterBattle || (res.kind === 'mission' ? 'missions' : 'city')) });
  ctx.sub.afterBattle = null;
}
const gearName = (id) => GEAR[id]?.name || id;

// ---------------------------------------------------------------- input
export const actions = {
  cell(ctx, el) {
    const b = ctx.state.battle, u = ui(ctx);
    if (!b || u.busy || b.side !== 'player' || b.status !== 'active') return;
    let x = +el.dataset.x, y = +el.dataset.y;
    const sel = selected(ctx);
    let occ = B.unitAt(b, x, y);
    if (!occ) { const st = structAt(b, x, y); if (st) { occ = st; x = st.x; y = st.y; } }
    const tg = targetsFor(ctx, b, sel).get(`${x},${y}`);
    if (tg && tg.kind === 'heal') return doAction(ctx, u.mode === 'patch' ? { type: 'patch', uid: sel.uid, target: tg.t.uid } : { type: 'gadget', uid: sel.uid, target: tg.t.uid });
    if (occ && occ.side === 'player') { u.sel = occ.uid; u.mode = 'shot'; return ctx.render(); }
    if (occ && occ.side === 'enemy') {
      if (tg) {
        if (u.mode === 'suppress') return doAction(ctx, { type: 'suppress', uid: sel.uid, target: occ.uid });
        if (u.mode === 'roll') return doAction(ctx, { type: 'skill', uid: sel.uid, target: occ.uid });
        return doAction(ctx, { type: 'attack', uid: sel.uid, target: occ.uid, mode: u.mode === 'throw' ? 'throw' : u.mode });
      }
      const p = sel && B.attackPreview(b, sel, occ, u.mode === 'aimed' ? 'aimed' : 'shot');
      if (occ.structure) return ctx.toast(`${occ.name} (Lv ${occ.level}): HP ${occ.hp}/${occ.maxHp}${occ.weapon ? `, shoots ${occ.weapon.dmg} dmg at range ${occ.weapon.range}` : ''}${occ.loot && (occ.loot.cash || occ.loot.influence) ? `, holds ${money(occ.loot.cash)}${occ.loot.influence ? ' + 🐾' + fmt(occ.loot.influence) : ''}` : ''}. ${p ? `Need ${p.cost} AP` : 'Get closer or find a clear line'}`);
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
    if (mode === 'howl') return doAction(ctx, { type: 'skill', uid: sel.uid });
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

// Static mini-board for scouting a rival base before a raid (City screen).
export function layoutPreview(lay, cw) {
  const keep = G;
  G = { cw, ch: cw / 2, pad: Math.round(cw * 0.9), w: lay.w, h: lay.h };
  const cells = [], decor = [];
  const propAt = new Set();
  for (const pr of lay.props) for (let j = pr.fy; j < pr.fy + pr.size; j++) for (let i = pr.fx; i < pr.fx + pr.size; i++) propAt.add(j * lay.w + i);
  for (let y = 0; y < lay.h; y++) for (let x = 0; x < lay.w; x++) {
    const i = y * lay.w + x, t = lay.tiles[i];
    cells.push(`<div class="icell ${(x + y) % 2 ? 'alt' : ''} ${x < 2 ? 'dep' : ''}" style="left:${cx(x, y) - G.cw / 2}px;top:${cy(x, y) - G.ch / 2}px;width:${G.cw}px;height:${G.ch}px;cursor:default"></div>`);
    if (!propAt.has(i) && t === B.T.COVER) decor.push(propHtml(COVER_SPR[lay.deco[i] % 3], 1, x, y, 1));
  }
  for (const pr of lay.props) decor.push(propHtml(pr.t, pr.lv, pr.fx, pr.fy, pr.size));
  const html = `<div class="iboard" style="width:${(lay.w + lay.h) * cw / 2}px;height:${G.pad + (lay.w + lay.h) * G.ch / 2}px;--cw:${cw}px;--ch:${cw / 2}px;margin:0 auto">${cells.join('')}${decor.join('')}</div>`;
  G = keep;
  return html;
}
