// Jobs screen: daily login streak, daily jobs, season pass track.
import { DAILY_REWARDS, GEAR } from '../core/data.js';
import * as M from '../core/meta.js';
import { fmt, money, rewardText, rewardTextPlain, ico, dur, esc } from './fmt.js';
import * as P from '../core/progression.js';
import { HEROES } from '../core/heroes.js';

// v0.10 Safehouse: Hideout stockpile (Lv 3) and operator jobs (Lv 7); the clinic is a base building since v0.11, then the
// daily pay-out. Locked panels show a one-line "Unlocks at Lv X" teaser only.
const lockedPanel = (id, title, ico2) => `<div class="shpanel locked"><div class="shhead"><span class="shico">${ico2}</span><b class="h">${title}</b></div><div class="tiny dim">🔒 Unlocks at player level ${P.unlockLv(id)}</div></div>`;
const left = (end, now) => `<span data-until="${end}">${dur(Math.max(0, (end - now) / 1000))}</span>`;

function stockPanel(s, now) {
  if (!P.isUnlocked(s, 'stockpile')) return lockedPanel('stockpile', 'Stockpile', '📦');
  const p = P.stockpile(s, now);
  return `<div class="shpanel"><div class="shhead"><span class="shico">📦</span><b class="h">Stockpile</b><span class="tiny dim">${money(p.rate.cash)}/h · ${p.rate.ammo} ammo/h</span></div>
    <div class="shbig"><b data-live="stockcash">${money(p.cash)}</b> <span class="tiny">+ ${ico('ammo')} <span data-live="stockammo">${p.ammo}</span></span></div>
    <div class="bar"><i data-live-bar="stock" style="width:${(p.hours / P.STOCK_CAP_H) * 100}%"></i></div>
    <div class="tiny dim">Piles up while you are away · full after ${P.STOCK_CAP_H}h${p.full ? ' · <span class="red">FULL</span>' : ''}</div>
    <button class="btn red block" data-act="collectStock" ${p.cash < 1 && p.ammo < 1 ? 'disabled' : ''}>Collect</button></div>`;
}

function jobsPanel(s, now) {
  if (!P.isUnlocked(s, 'jobs')) return lockedPanel('jobs', 'Operator jobs', '💼');
  const act = s.opJobs.map((j) => {
    const job = P.OP_JOBS.find((x) => x.id === j.job) || P.OP_JOBS[0];
    const done = now >= j.end;
    return `<div class="shrow"><img loading="lazy" decoding="async" src="${HEROES[j.hero]?.thumb || HEROES[j.hero]?.portrait}" alt=""><div class="grow"><b class="small">${esc(HEROES[j.hero]?.name || j.hero)}</b>
      <div class="tiny dim">${esc(job.name)} · ${done ? '<span class="green">Done</span>' : left(j.end, now)}</div></div>
      ${done ? `<button class="btn sm red" data-act="collectOpJob" data-id="${j.hero}">Collect</button>` : ''}</div>`;
  }).join('');
  const free = s.opJobs.length < P.jobSlots(s);
  return `<div class="shpanel"><div class="shhead"><span class="shico">💼</span><b class="h">Operator jobs</b><span class="tiny dim">${s.opJobs.length}/${P.jobSlots(s)} slots</span></div>
    ${act}
    ${free ? `<div class="shjobs">${P.OP_JOBS.map((j) => `<button class="shjob" data-act="pickJob" data-id="${j.id}"><b class="tiny">${esc(j.name)}</b><span class="tiny dim">${j.hours}h · ${esc(rewardLine(s, j.reward))}</span></button>`).join('')}</div>` : '<div class="tiny dim">All slots busy.</div>'}
    <div class="tiny faint">Operators on a job sit out ops until they are back.</div></div>`;
}
const rewardLine = (s, r) => [r.cash ? money(r.cash) : '', r.influence && P.isUnlocked(s, 'rep') ? `${r.influence} Rep` : '', r.parts ? `${r.parts} parts` : '', r.universal ? `${r.universal} shards` : ''].filter(Boolean).join(' · ');

export function live(ctx, now) {
  document.querySelectorAll('[data-until]').forEach((n) => { const v = dur(Math.max(0, (+n.dataset.until - now) / 1000)); if (n.textContent !== v) n.textContent = v; });
  const s = ctx.state;
  if (P.isUnlocked(s, 'stockpile')) {
    const p = P.stockpile(s, now);
    const a = document.querySelector('[data-live="stockcash"]'); if (a) a.textContent = money(p.cash);
    const b = document.querySelector('[data-live="stockammo"]'); if (b) b.textContent = p.ammo;
    const bar = document.querySelector('[data-live-bar="stock"]'); if (bar) bar.style.width = (p.hours / P.STOCK_CAP_H) * 100 + '%';
  }
  if (s.opJobs.some((j) => j.end <= now && !ctx.sub.jobDoneShown?.[j.hero + j.end])) {
    ctx.sub.jobDoneShown ||= {};
    for (const j of s.opJobs) if (j.end <= now) ctx.sub.jobDoneShown[j.hero + j.end] = 1;
    ctx.render();
  }
}

// v0.17 fewer taps: everything in the Safehouse that is ready to collect right now.
export function readyList(s, now) {
  const out = [];
  if (P.isUnlocked(s, 'stockpile')) { const p = P.stockpile(s, now); if (p.cash >= 1 || p.ammo >= 1) out.push({ k: 'stock' }); }
  for (const j of s.opJobs || []) if (now >= j.end) out.push({ k: 'opjob', id: j.hero });
  if (!M.dailyStatus(s, now).claimedToday) out.push({ k: 'daily' });
  for (const j of (s.jobs && s.jobs.list) || []) if (!j.claimed && M.jobProgress(s, j).done) out.push({ k: 'job', id: j.id });
  return out;
}

export function render(ctx) {
  const s = ctx.state, now = ctx.now();
  M.ensureJobs(s, now);
  const ds = M.dailyStatus(s, now);
  const passTier = Math.floor(s.passXp / 100);
  return `
  <div class="title"><span class="h">Safehouse</span><span class="sub">/ Stockpile · Jobs</span>${(() => { const r = readyList(s, now); return r.length >= 2 ? `<button class="btn red collall" data-act="collectAll">Collect all <span class="badge-ready">${r.length} ready</span></button>` : ''; })()}</div>
  <div class="shgrid">${stockPanel(s, now)}${jobsPanel(s, now)}</div>
  <div class="sect">Daily</div>
  <div class="tagline">Show up every day. The family notices.</div>
  <div class="sect">Daily pay-out · streak ${ds.streak}</div>
  <div class="days">${DAILY_REWARDS.map((r, i) => {
    const done = ds.claimedToday ? i <= ds.index : i < ds.index;
    const today = !ds.claimedToday && i === ds.index;
    return `<div class="day ${done ? 'done' : ''} ${today ? 'today' : ''}"><div class="d">Day ${i + 1}</div><div>${r.cash ? ico('cash') : r.teeth && r.ticket ? '🎟️' : r.teeth ? ico('teeth') : r.influence ? ico('influence') : '🎒'}</div><div class="tiny">${r.gear ? GEAR[r.gear].name.split(' ')[0] : rewardText(r).replace('recruit ticket', '')}</div></div>`; }).join('')}</div>
  <button class="btn ${ds.claimedToday ? '' : 'red'} block" style="margin-top:8px" data-act="claimDaily" ${ds.claimedToday ? 'disabled' : ''}>${ds.claimedToday ? 'Come back tomorrow' : 'Claim today\'s pay-out'}</button>

  <div class="sect">Today's jobs</div>
  <div class="grid2">${s.jobs.list.map((j) => { const p = M.jobProgress(s, j); return `<div class="card">
    <div class="row"><div class="grow"><div>${p.t.text}</div><div class="tiny dim">Reward: ${rewardText(p.t.reward)} · +40 pass XP</div>
      <div class="bar" style="margin-top:6px"><i style="width:${(p.progress / p.t.goal) * 100}%"></i></div><div class="tiny faint">${p.progress}/${p.t.goal}</div></div>
    ${j.claimed ? '<span class="pill green">Done</span>' : `<button class="btn sm ${p.done ? 'red' : ''}" data-act="claimJob" data-id="${j.id}" ${p.done ? '' : 'disabled'}>Claim</button>`}</div></div>`; }).join('')}</div>

  <div class="sect">Street Pass · Season 1: Neon Rain</div>
  <div class="card">
    <div class="row"><div class="grow"><div class="h">Tier ${passTier}/30</div><div class="tiny dim">Earn pass XP from fights and jobs. Free track for everyone; premium track with the Street Pass (£7.99).</div></div>
    ${s.pass ? '<span class="pill gold">Premium</span>' : '<button class="btn gold sm" data-act="nav" data-tab="shop">Get pass</button>'}</div>
    <div class="bar gold" style="margin:8px 0"><i style="width:${(s.passXp % 100)}%"></i></div>
    <div class="pass">${M.PASS_TIERS.map((t) => `<div class="ptier ${passTier >= t.tier ? 'got' : ''}"><div class="n">${t.tier}</div><div class="f">${rewardText(t.free)}</div><div class="p ${s.pass ? '' : 'lock'}">${s.pass ? '' : '🔒 '}${rewardText(t.premium)}</div></div>`).join('')}</div>
  </div>`;
}

export const actions = {
  collectStock(ctx) { const r = P.collectStockpile(ctx.state, ctx.now()); if (!r.ok) return ctx.toast(r.reason); ctx.toast(`Collected ${money(r.cash)}${r.ammo ? ` and ${r.ammo} ammo` : ''}${r.lost > 0 ? ` · ${money(r.lost)} left in the pile (storage full)` : ''}`); ctx.render(); },
  collectOpJob(ctx, el) { const r = P.collectJob(ctx.state, el.dataset.id, ctx.now()); if (!r.ok) return ctx.toast(r.reason); ctx.toast(`${HEROES[el.dataset.id].name} is back: ${rewardLine(ctx.state, r.got)}`); ctx.render(); },
  pickJob(ctx, el) {
    const s = ctx.state, now = ctx.now(), job = P.OP_JOBS.find((j) => j.id === el.dataset.id);
    const ids = Object.keys(s.heroes.owned).filter((id) => P.isAvailable(s, id, now));
    ctx.modal(`<div class="h" style="font-size:20px">${esc(job.name)} · ${job.hours}h</div><p class="small dim">${esc(job.text)} Reward: ${esc(rewardLine(s, job.reward))}.</p>
      <div class="row" style="gap:6px;flex-wrap:wrap">${ids.map((id) => `<button class="btn" data-act="sendJob" data-hero="${id}" data-job="${job.id}">Send ${esc(HEROES[id].name)}</button>`).join('') || '<span class="tiny dim">Nobody is free.</span>'}</div>
      <p class="tiny faint">You must keep at least one operator home for ops.</p>`, { center: true });
  },
  sendJob(ctx, el) { const r = P.sendOnJob(ctx.state, el.dataset.hero, el.dataset.job, ctx.now()); ctx.closeModal(true); if (!r.ok) return ctx.toast(r.reason); ctx.toast(`${HEROES[el.dataset.hero].name} is out: ${r.job.name}`); ctx.render(); },
  collectAll(ctx) {
    const s = ctx.state, now = ctx.now(); let n = 0;
    for (const r of readyList(s, now)) {
      const res = r.k === 'stock' ? P.collectStockpile(s, now) : r.k === 'opjob' ? P.collectJob(s, r.id, now) : r.k === 'daily' ? M.claimDaily(s, now) : M.claimJob(s, r.id);
      if (res && res.ok) n++;
    }
    ctx.toast(n ? `Collected ${n} reward${n > 1 ? 's' : ''}` : 'Nothing ready yet'); ctx.save?.(); ctx.render();
  },
  claimDaily(ctx) { const r = M.claimDaily(ctx.state, ctx.now()); if (r.ok) ctx.toast('Collected: ' + rewardTextPlain(r.reward)); ctx.render(); },
  claimJob(ctx, el) { const r = M.claimJob(ctx.state, el.dataset.id); if (r.ok) ctx.toast('Job done: ' + rewardTextPlain(r.reward)); ctx.render(); },
};
