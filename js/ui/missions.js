// Missions screen: the four gang districts as PvE campaigns, three stages each.
// Rules live in core/meta.js; turf art is in assets/turf/.
import { MISSIONS, GANGS } from '../core/data.js';
import * as M from '../core/meta.js';
import * as C from '../core/crew.js';
import * as BS from '../core/base.js';
import { fmt, money, esc, ico, dur } from './fmt.js';
import * as O from '../core/ops.js';
import * as P from '../core/progression.js';
import { HEROES, defOf } from '../core/heroes.js';
import { BUILTIN_BY_ID } from '../core/maps/index.js';

function stageRow(ctx, gi, si, campLocked) {
  const m = MISSIONS[gi], stage = m.stages[si];
  const st = M.missionStatus(ctx.state, gi, si);
  const locked = campLocked || st.locked;
  const done = !!st.done;
  const r = M.missionReward(gi, si, done);
  return `<button class="mstage ${locked ? 'locked' : done ? 'done' : 'open'}" data-act="${locked ? 'missionLocked' : 'missionInfo'}" data-gi="${gi}" data-si="${si}">
    <span class="mn">${si + 1}</span>
    <span class="grow"><b class="tiny h">${esc(stage.name)}</b>
      <span class="tiny dim">${stage.count} enemies · lv ${stage.level}${stage.boss ? ' · Boss' : ''}${done ? ' · rematch' : ''}</span></span>
    <span class="tiny ${locked ? 'faint' : done ? 'green' : 'gold'}">${locked ? '🔒' : done ? '✓' : money(r.cash)}</span>
  </button>`;
}

function campaign(ctx, m, gi, den) {
  const locked = den < m.den;
  const cleared = M.missionCleared(ctx.state, m.gang);
  const g = GANGS[m.gang];
  return `<div class="mcard ${locked ? 'locked' : ''}">
    <div class="mhero" style="background-image:url(${m.img})">
      <div class="mshade">
        <div class="h">${esc(m.name)}</div>
        <div class="tiny" style="color:${g.colour}">${esc(g.name)}</div>
      </div>
      ${locked ? `<span class="mlock">🔒 Den ${m.den}</span>` : cleared >= m.stages.length ? '<span class="mdone">Cleared</span>' : ''}
    </div>
    <p class="mblurb tiny dim">${esc(m.blurb)}</p>
    <div class="mstages">${m.stages.map((_, si) => stageRow(ctx, gi, si, locked)).join('')}</div>
  </div>`;
}

// v0.10 Ops: short turn-based fights for operators. Open ops, plus one locked teaser.
function opCard(ctx, op) {
  const s = ctx.state;
  const st = O.opStatus(s, op);
  const first = !st.cleared;
  const map = BUILTIN_BY_ID[op.map] || {};
  const r = O.opReward(s, op, first);
  const n = Math.max(1, Math.min(op.foes.length, P.opsSquad(s, ctx.now()).length));
  const xp = O.opXp(op, true, first);
  const foes = op.foes.map((f) => `<img loading="lazy" decoding="async" src="${defOf(f).thumb || defOf(f).portrait}" alt="" title="${esc(defOf(f).name)} · ${esc(defOf(f).role)}">`).join('');
  if (st.locked) {
    return `<article class="opscard locked" data-act="opLocked" data-id="${op.id}"><div class="ophd"><b class="h">${esc(op.name)}</b><span class="tiny">🔒 ${esc(st.reason)}</span></div>
      <div class="tiny dim">${esc(map.name || '')} · ${op.foes.length} ${op.foes.length === 1 ? 'foe' : 'foes'}</div><div class="opfoes dimmed">${foes}</div></article>`;
  }
  return `<article class="opscard ${st.cleared ? 'done' : 'new'}">
    <div class="ophd"><b class="h">${esc(op.name)}</b>${st.cleared ? '<span class="optag ok">✓ Complete</span>' : op.tut ? '<span class="optag">TUTORIAL · FREE</span>' : '<span class="optag new">NEW</span>'}</div>
    <div class="tiny gold">${esc(map.name || 'Docklands')} · ${op.lesson ? '1 v 1' : `${n} v ${op.foes.length}`} · ~${op.foes.length <= 1 ? 3 : op.foes.length <= 2 ? 4 : 5} min</div>
    <div class="tiny dim opblurb">${esc(op.blurb)}</div>
    <div class="opfoes">${foes}<span class="tiny dim">Lv ${op.elv}</span></div>
    <div class="tiny">${money(r.cash)}${r.influence ? ` · ${ico('influence')} ${r.influence}` : ''} · +${xp} XP${first && !op.tut ? ' <span class="gold">first clear ×2</span>' : st.cleared && !op.tut ? ' <span class="dim">replay · ½ rewards</span>' : ''}</div>
    <button class="btn ${st.cleared ? '' : 'red'} block" data-act="startOp" data-id="${op.id}">${st.cleared ? (op.tut ? '↻ Replay · free' : '↻ Replay · ⚡1') : op.tut ? 'Play · free' : 'Play · ⚡1'}</button>
  </article>`;
}

function opsList(ctx) {
  const s = ctx.state, now = ctx.now();
  const open = O.OPS.filter((o) => !O.opStatus(s, o).locked);
  const teaser = O.OPS.find((o) => O.opStatus(s, o).locked);
  // newest first so the next op is the first card you see
  const list = [...open].reverse();
  const nextOp = O.nextOp(s);
  const i = list.indexOf(nextOp); if (i > 0) { list.splice(i, 1); list.unshift(nextOp); }
  const sq = P.opsSquad(s, now);
  const e = P.energy(s, now);
  return `<div class="opsbar">
      <span class="opchip">👥 Squad: <b>${sq.map((id) => esc(HEROES[id].name)).join(', ') || 'nobody home'}</b> (${sq.length}/${P.squadCap(s)})</span>
      <span class="opchip">⚡ <b>${e.n}/${e.max}</b> energy · 1 per op, tutorial ops free</span>
      <button class="btn sm" data-act="nav" data-tab="heroes">Squad</button>
    </div>
    <div class="opsscroll">${list.map((o) => opCard(ctx, o)).join('')}${teaser ? opCard(ctx, teaser) : ''}</div>`;
}

export function render(ctx) {
  const s = ctx.state, now = ctx.now();
  const den = BS.denLevel(s);
  const line = C.lineup(s, now);
  // Gang campaigns are fought by troops: only shown to older crews that still have troops.
  const camps = line.length ? `<div class="sect">Gang missions (troops)</div>
  <div class="tiny dim" style="margin:0 0 8px">One city, four turf wars. Your troops: ${line.length} fighter${line.length === 1 ? '' : 's'} · power ${fmt(C.lineupPower(s, now))}.</div>
  <div class="mcamp">${MISSIONS.map((m, gi) => campaign(ctx, m, gi, den)).join('')}</div>` : '';
  return `
  <div class="opsscreen">
  <div class="title"><span class="h">Ops</span><span class="sub">/ Short fights · 3–5 minutes</span></div>
  ${opsList(ctx)}
  ${camps}
  </div>`;
}

export function startOpById(ctx, id) {
  const s = ctx.state, now = ctx.now();
  const r = O.startOp(s, id, now);
  if (!r.ok) {
    if (r.reason === 'energy') return energyModal(ctx);
    return ctx.toast(r.reason);
  }
  s.tactics = r.battle;
  ctx.sub.tactics = null;
  ctx.sub.afterBattle = 'missions';
  ctx.closeModal(true);
  ctx.go('tactics');
}

export function energyModal(ctx) {
  const s = ctx.state, e = P.energy(s, ctx.now());
  ctx.modal(`<div class="h" style="font-size:22px">⚡ Energy ${e.n}/${e.max}</div>
    <p class="small">Each op costs 1 energy; tutorial ops are free. You get 1 back every 10 minutes, even while the game is closed${e.n < e.max ? ` — next in <b data-live="enext">${dur(e.nextMs / 1000)}</b>, full in ${dur(e.fullMs / 1000)}` : ''}.</p>
    <p class="tiny dim">Meanwhile: collect the stockpile, upgrade the Hideout, or kit out your operators.</p>
    <div class="row" style="gap:6px">
      ${P.isUnlocked(s, 'market') && e.n < e.max ? `<button class="btn gold block" data-act="refillEnergy">Refill now · ${ico('teeth')} ${P.ENERGY_REFILL_ICE}</button>` : ''}
      <button class="btn block" data-act="closeModal">OK</button>
    </div>`, { center: true });
}

export const actions = {
  startOp(ctx, el) { startOpById(ctx, el.dataset.id); },
  opLocked(ctx, el) { const st = O.opStatus(ctx.state, O.OP_BY_ID[el.dataset.id]); ctx.toast(st.reason || 'Locked'); },
  refillEnergy(ctx) { const r = P.refillEnergy(ctx.state, ctx.now()); if (!r.ok) return ctx.toast(r.reason); ctx.closeModal(true); ctx.toast('Energy refilled'); ctx.render(); },
  missionLocked(ctx, el) {
    const st = M.missionStatus(ctx.state, +el.dataset.gi, +el.dataset.si);
    const m = MISSIONS[+el.dataset.gi];
    ctx.toast(st.reason || (m && BS.denLevel(ctx.state) < m.den ? `Needs Den level ${m.den}` : 'Locked'));
  },
  missionInfo(ctx, el) {
    const gi = +el.dataset.gi, si = +el.dataset.si;
    const m = MISSIONS[gi], stage = m.stages[si], g = GANGS[m.gang];
    const st = M.missionStatus(ctx.state, gi, si);
    if (st.locked) return ctx.toast(st.reason || 'Locked');
    const r = M.missionReward(gi, si, !!st.done);
    const line = C.lineup(ctx.state, ctx.now());
    ctx.modal(`
      <div class="mpreview" style="background-image:url(${m.img})"></div>
      <div class="h" style="font-size:22px;margin-top:8px">${esc(stage.name)}</div>
      <div class="tiny" style="color:${g.colour}">${esc(m.name)} · ${esc(g.name)} · mission ${si + 1} of ${m.stages.length}</div>
      <p class="small dim">${esc(m.blurb)}${stage.boss ? ' The gang’s boss is on the board.' : ''}</p>
      <div class="card"><div class="tiny red h">${st.done ? 'Rematch payout (first-clear already taken)' : 'Win and you get'}</div>
        <div class="small">${money(r.cash)} · ${ico('influence')} ${fmt(r.influence)} Rep${r.teeth ? ` · ${ico('teeth')} ${r.teeth}` : ''} · +${r.rep} Reputation</div></div>
      <div class="tiny dim">Your crew: ${line.length} fighters · power ${fmt(C.lineupPower(ctx.state, ctx.now()))}. Knocked-out troops are lost.</div>
      ${line.length ? `<button class="btn red block" style="margin-top:8px" data-act="startMission" data-gi="${gi}" data-si="${si}">${st.done ? 'Rematch' : 'Start mission'}</button>` : `<button class="btn block off" style="margin-top:8px">Gang missions need troops. Troop hiring at the base is coming soon.</button>`}`, { center: true });
  },
  startMission(ctx, el) {
    ctx.closeModal(true);
    const r = M.startMission(ctx.state, +el.dataset.gi, +el.dataset.si, ctx.now());
    if (!r.ok) return ctx.toast(r.reason === 'squad' ? 'No troops yet. Troop hiring at the base is coming soon.' : r.reason === 'locked' ? 'That mission is locked' : 'Cannot start');
    ctx.sub.battle = null;
    ctx.go('battle');
  },
};
