// City screen: turf map (PvE districts) + rival bases to raid (async PvP, simulated in the prototype).
import { DISTRICTS, GANGS, SPECIES, REP_TIERS } from '../core/data.js';
import { BUILDINGS, turretOf } from '../core/buildings.js';
import * as C from '../core/crew.js';
import * as M from '../core/meta.js';
import { layoutPreview } from './battle.js';
import { fmt, money, dur, esc } from './fmt.js';

const gangImg = (g) => SPECIES[GANGS[g].species[0]].img;
const unlocksOf = (id) => Object.values(BUILDINGS).filter((b) => b.req === id).map((b) => b.name);

function districtState(s, d) {
  if (s.districts[d.id].owner === 'player') return 'own';
  const prev = DISTRICTS.find((x) => x.tier === d.tier - 1);
  return !prev || s.districts[prev.id].owner === 'player' ? 'open' : 'locked';
}
const lootTotal = (r) => `${money(r.loot.cash)}${r.loot.influence ? ` · 🐾 ${fmt(r.loot.influence)} Rep` : ''}`;
const defences = (r) => r.base.filter((b) => turretOf(b.t, b.lv)).length;

export function render(ctx) {
  const s = ctx.state, now = ctx.now();
  M.refreshRivals(s, now);
  const tier = M.repTier(s.rep), next = M.nextRepTier(s.rep);
  const links = DISTRICTS.slice(1).map((d) => { const p = DISTRICTS.find((x) => x.tier === d.tier - 1); return `<line x1="${p.x}%" y1="${p.y}%" x2="${d.x}%" y2="${d.y}%" stroke="${s.districts[d.id].owner === 'player' ? '#c9302c' : '#3d3431'}" stroke-width="2" stroke-dasharray="${s.districts[d.id].owner === 'player' ? '0' : '5 5'}"/>`; }).join('');
  const owned = DISTRICTS.filter((d) => s.districts[d.id].owner === 'player').length;
  return `
  <div class="citygrid">
  <div>
    <div class="title"><span class="h">City</span><span class="sub">/ Turf · ${owned}/${DISTRICTS.length}</span></div>
    <div class="map">
      <svg>${links}</svg>
      ${DISTRICTS.map((d) => { const st = districtState(s, d); const own = st === 'own';
        return `<button class="dnode ${st}" style="left:${d.x}%;top:${d.y}%" data-act="district" data-id="${d.id}">
          <div class="dot" style="${own ? `background-image:url(assets/boss-magrey.jpg)` : d.rival ? `background-image:url(${d.tier >= 5 ? 'assets/croc.jpg' : gangImg(M.districtRival(s, d))})` : ''}">${st === 'locked' ? '🔒' : ''}</div>
          <div class="lbl" style="color:${own ? '#ff8a7a' : d.rival ? GANGS[M.districtRival(s, d)].colour : '#ccc'}">${d.name}</div></button>`; }).join('')}
    </div>
  </div>
  <div>
    <div class="card" style="margin-top:4px">
      <div class="row"><div class="grow"><div class="tiny red h">Reputation</div><div class="h" style="font-size:17px">${tier.name} · ${s.rep}</div></div>
      <div class="tiny dim" style="text-align:right">${next ? `${next.min - s.rep} to ${next.name}` : 'Top of the ladder'}</div></div>
      <div class="bar gold" style="margin-top:6px"><i style="width:${next ? ((s.rep - tier.min) / (next.min - tier.min)) * 100 : 100}%"></i></div>
    </div>
    <div class="sect">Rival bases to raid <span class="pill" style="margin-left:4px">simulated</span></div>
    ${s.rivals.map((r) => `<div class="card rival" style="grid-template-columns:44px 1fr auto">
      <div class="portrait" style="width:44px;height:44px;background-image:url(${gangImg(r.gang)})"></div>
      <div class="grow"><div class="h">${esc(r.name)} <span class="lvtag">Den ${r.denLv}</span></div>
        <div class="tiny" style="color:${GANGS[r.gang].colour}">${GANGS[r.gang].name} · ${r.count} guards · ${defences(r)} defences</div>
        <div class="tiny">Loot: <b class="gold">${lootTotal(r)}</b> · <span class="${r.odds === 'Easy' ? 'green' : r.odds === 'Risky' ? 'red' : 'gold'}">${r.odds}</span></div></div>
      <div class="col"><button class="btn sm" data-act="scout" data-id="${r.id}">Scout</button><button class="btn red sm" data-act="raid" data-id="${r.id}">Raid</button></div>
    </div>`).join('') || '<div class="card tiny dim">No rivals around. New targets in a few minutes.</div>'}
    <div class="row"><span class="tiny dim grow">Crew power <b>${fmt(C.lineupPower(s, ctx.now()))}</b>. New targets every 15 min.</span>
    <button class="btn sm" data-act="refreshRivals">Next · 🦷 5</button></div>
  </div></div>`;
}

export const actions = {
  district(ctx, el) {
    const s = ctx.state, now = ctx.now();
    const d = DISTRICTS.find((x) => x.id === el.dataset.id);
    const st = districtState(s, d);
    const unlocks = unlocksOf(d.id);
    let body;
    if (st === 'own') body = `<p class="green">Held by your gang.</p><p class="small dim">${d.bonus ? `+${Math.round(d.bonus * 100)}% income · 🐾 ${d.influencePerHour} Rep/hour` : 'Home turf'}${unlocks.length ? ` · unlocks ${unlocks.join(', ')}` : ''}</p>
      <p class="tiny faint">In the full game rival players can attack your districts while you're away; your base defences and guards fight back automatically.</p>`;
    else {
      const e = M.districtEnemy(d, s);
      const rv = e.gang;
      const rw = M.districtReward(s, d, now);
      body = `<div class="row" style="margin:8px 0"><div class="portrait" style="width:64px;height:64px;background-image:url(${d.tier >= 5 ? 'assets/croc.jpg' : gangImg(rv)})"></div>
        <div class="grow"><div class="h" style="color:${GANGS[rv].colour}">${GANGS[rv].name}</div><div class="tiny dim">${GANGS[rv].blurb}</div>
        <div class="small">${e.count} defenders · level ~${e.level}${e.boss ? ' · <b class="gold">Boss: Old Scales</b>' : ''}</div></div></div>
        <div class="card"><div class="tiny red h">Take it and you get</div>
          <div class="small">+${Math.round(d.bonus * 100)}% income forever · 🐾 ${d.influencePerHour} Rep/hour${unlocks.length ? ` · unlocks <b>${unlocks.join(', ')}</b> at the Hideout` : ''}</div>
          <div class="small">Win: ${money(rw.cash)} · 🐾 ${rw.influence} Rep · 🦷 ${rw.teeth} · +${rw.rep} Reputation · 60% gear drop</div></div>
        <div class="tiny dim">Your crew: power ${fmt(C.lineupPower(s, ctx.now()))} (${C.lineup(s, ctx.now()).length} fighters).</div>
        ${st === 'locked' ? `<button class="btn block off" style="margin-top:8px">Take the previous district first</button>` : `<button class="btn red block" style="margin-top:8px" data-act="startDistrict" data-id="${d.id}">Start turf war</button>`}`;
    }
    ctx.modal(`<div class="h" style="font-size:24px">${d.name}</div><div class="tiny dim">${d.desc}</div>${body}`, { center: true });
  },
  startDistrict(ctx, el) {
    const r = M.startDistrictBattle(ctx.state, el.dataset.id, ctx.now());
    ctx.closeModal(true);
    if (!r.ok) return ctx.toast(r.reason === 'squad' ? 'No troops. Train some in My Crew.' : 'Cannot start');
    ctx.sub.battle = null;
    ctx.go('battle');
  },
  scout(ctx, el) {
    const r = ctx.state.rivals.find((x) => x.id === el.dataset.id);
    if (!r) return;
    const lay = M.rivalLayout(r);
    const cw = Math.max(26, Math.min(44, Math.floor((window.innerWidth * 0.9 - 40) / ((lay.w + lay.h) / 2)), Math.floor((window.innerHeight - 170) / ((lay.w + lay.h) / 4 + 0.9))));
    ctx.modal(`<div class="row"><div class="grow"><div class="h" style="font-size:20px">${esc(r.name)} <span class="lvtag">Den ${r.denLv}</span></div>
      <div class="tiny dim">${GANGS[r.gang].name} · ${r.count} guards · ${defences(r)} defences · loot ${lootTotal(r)}</div></div>
      <button class="btn red" data-act="raid" data-id="${r.id}">⚔ Raid</button></div>
      <div style="margin-top:6px">${layoutPreview(lay, cw)}</div>
      <div class="tiny faint">You deploy on the left. Wreck The Den to win and take everything left; Strongboxes and Ledgers pay out as they fall. Sniper Nests and Scrap Cannons shoot back.</div>`, { cls: 'wide' });
  },
  raid(ctx, el) {
    ctx.closeModal(true);
    const r = M.startRaid(ctx.state, el.dataset.id, ctx.now());
    if (!r.ok) return ctx.toast(r.reason === 'squad' ? 'No troops. Train some in My Crew.' : 'Cannot start raid');
    ctx.sub.battle = null;
    ctx.go('battle');
  },
  refreshRivals(ctx) {
    if (ctx.state.teeth < 5) return ctx.toast('Not enough Gold Teeth');
    ctx.state.teeth -= 5;
    M.refreshRivals(ctx.state, ctx.now(), true);
    ctx.render();
  },
};
