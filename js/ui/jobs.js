// Jobs screen: daily login streak, daily jobs, season pass track.
import { DAILY_REWARDS, GEAR } from '../core/data.js';
import * as M from '../core/meta.js';
import { fmt, money, rewardText } from './fmt.js';

export function render(ctx) {
  const s = ctx.state, now = ctx.now();
  M.ensureJobs(s, now);
  const ds = M.dailyStatus(s, now);
  const passTier = Math.floor(s.passXp / 100);
  return `
  <div class="title"><span class="h">Jobs</span><span class="sub">/ Daily</span></div>
  <div class="tagline">Show up every day. The family notices.</div>
  <div class="sect">Daily pay-out · streak ${ds.streak}</div>
  <div class="days">${DAILY_REWARDS.map((r, i) => {
    const done = ds.claimedToday ? i <= ds.index : i < ds.index;
    const today = !ds.claimedToday && i === ds.index;
    return `<div class="day ${done ? 'done' : ''} ${today ? 'today' : ''}"><div class="d">Day ${i + 1}</div><div>${r.cash ? '💵' : r.teeth && r.ticket ? '🎟️' : r.teeth ? '🦷' : r.influence ? '🐾' : '🎒'}</div><div class="tiny">${r.gear ? GEAR[r.gear].name.split(' ')[0] : rewardText(r).replace('recruit ticket', '')}</div></div>`; }).join('')}</div>
  <button class="btn ${ds.claimedToday ? '' : 'red'} block" style="margin-top:8px" data-act="claimDaily" ${ds.claimedToday ? 'disabled' : ''}>${ds.claimedToday ? 'Come back tomorrow' : 'Claim today\'s pay-out'}</button>

  <div class="sect">Today's jobs</div>
  ${s.jobs.list.map((j) => { const p = M.jobProgress(s, j); return `<div class="card">
    <div class="row"><div class="grow"><div>${p.t.text}</div><div class="tiny dim">Reward: ${rewardText(p.t.reward)} · +40 pass XP</div>
      <div class="bar" style="margin-top:6px"><i style="width:${(p.progress / p.t.goal) * 100}%"></i></div><div class="tiny faint">${p.progress}/${p.t.goal}</div></div>
    ${j.claimed ? '<span class="pill green">Done</span>' : `<button class="btn sm ${p.done ? 'red' : ''}" data-act="claimJob" data-id="${j.id}" ${p.done ? '' : 'disabled'}>Claim</button>`}</div></div>`; }).join('')}

  <div class="sect">Street Pass · Season 1: Neon Rain</div>
  <div class="card">
    <div class="row"><div class="grow"><div class="h">Tier ${passTier}/30</div><div class="tiny dim">Earn pass XP from fights and jobs. Free track for everyone; premium track with the Street Pass (£7.99).</div></div>
    ${s.pass ? '<span class="pill gold">Premium</span>' : '<button class="btn gold sm" data-act="nav" data-tab="shop">Get pass</button>'}</div>
    <div class="bar gold" style="margin:8px 0"><i style="width:${(s.passXp % 100)}%"></i></div>
    <div class="pass">${M.PASS_TIERS.map((t) => `<div class="ptier ${passTier >= t.tier ? 'got' : ''}"><div class="n">${t.tier}</div><div class="f">${rewardText(t.free)}</div><div class="p ${s.pass ? '' : 'lock'}">${s.pass ? '' : '🔒 '}${rewardText(t.premium)}</div></div>`).join('')}</div>
  </div>`;
}

export const actions = {
  claimDaily(ctx) { const r = M.claimDaily(ctx.state, ctx.now()); if (r.ok) ctx.toast('Collected: ' + rewardText(r.reward)); ctx.render(); },
  claimJob(ctx, el) { const r = M.claimJob(ctx.state, el.dataset.id); if (r.ok) ctx.toast('Job done: ' + rewardText(r.reward)); ctx.render(); },
};
