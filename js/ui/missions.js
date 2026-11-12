// Missions screen: the four gang districts as PvE campaigns, three stages each.
// Rules live in core/meta.js; turf art is in assets/turf/.
import { MISSIONS, GANGS } from '../core/data.js';
import * as M from '../core/meta.js';
import * as C from '../core/crew.js';
import * as BS from '../core/base.js';
import { fmt, money, esc } from './fmt.js';

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

export function render(ctx) {
  const s = ctx.state, now = ctx.now();
  const den = BS.denLevel(s);
  const line = C.lineup(s, now);
  return `
  <div class="title"><span class="h">Missions</span><span class="sub">/ The four gangs</span></div>
  <div class="tiny dim" style="margin:-6px 0 8px">One city, four turf wars. Unlock the later districts by upgrading The Den. Your crew: ${line.length} fighter${line.length === 1 ? '' : 's'} · power ${fmt(C.lineupPower(s, now))}.</div>
  <div class="mcamp">${MISSIONS.map((m, gi) => campaign(ctx, m, gi, den)).join('')}</div>`;
}

export const actions = {
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
        <div class="small">${money(r.cash)} · 🐾 ${fmt(r.influence)} Rep${r.teeth ? ` · 🦷 ${r.teeth}` : ''} · +${r.rep} Reputation</div></div>
      <div class="tiny dim">Your crew: ${line.length} fighters · power ${fmt(C.lineupPower(ctx.state, ctx.now()))}. Knocked-out troops are lost.</div>
      ${line.length ? `<button class="btn red block" style="margin-top:8px" data-act="startMission" data-gi="${gi}" data-si="${si}">${st.done ? 'Rematch' : 'Start mission'}</button>` : `<button class="btn block off" style="margin-top:8px">No troops. Train some in My Crew.</button>`}`, { center: true });
  },
  startMission(ctx, el) {
    ctx.closeModal(true);
    const r = M.startMission(ctx.state, +el.dataset.gi, +el.dataset.si, ctx.now());
    if (!r.ok) return ctx.toast(r.reason === 'squad' ? 'No troops. Train some in My Crew.' : r.reason === 'locked' ? 'That mission is locked' : 'Cannot start');
    ctx.sub.battle = null;
    ctx.go('battle');
  },
};
