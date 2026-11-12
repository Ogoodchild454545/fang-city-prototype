// Pre-battle loadout: pick up to four operators, load ammo and medkits, assign gear, opt into High Stakes.
import { HEROES, setSquad } from '../core/heroes.js';
import { startStreet } from '../core/tactics.js';
import { defaultLoadout, commitLoadout, carryOf, medCarry, KIT, KIT_ORDER, craftKit, equipGear, inventoryCount, kitFits } from '../core/loadout.js';
import { ensurePvp, leagueOf, opponentLabel } from '../core/pvp.js';
import { rankName } from '../core/progress.js';
import { fmt, ico, esc } from './fmt.js';
import * as BS from '../core/base.js';
import * as Audio from './audio.js';

const lo = (ctx) => (ctx.sub.loadout ||= { draft: null, confirmHS: false });

function ensure(ctx) {
  const u = lo(ctx);
  if (!u.draft) u.draft = defaultLoadout(ctx.state);
  return u.draft;
}

export function render(ctx) {
  const s = ctx.state, d = ensure(ctx), cap = BS.caps(s);
  const owned = Object.keys(s.heroes.owned);
  const usedA = d.squad.reduce((n, id) => n + (d.ammo[id] || 0), 0);
  const usedM = d.squad.reduce((n, id) => n + (d.medkits[id] || 0), 0);
  return `
  <div class="loadscr">
    <div class="loadbody">
    <div class="armyhead">
      <div>
        <div class="h">${d.highStakes ? 'High Stakes loadout' : 'Street fight loadout'}</div>
        <div class="tiny dim">Pick up to four operators — any mix of classes is allowed, including two of the same. You are matched with a crew near your trophy count. Unused ammo comes back; spent rounds are gone.</div>
      </div>
      <button class="btn dim" data-act="nav" data-tab="heroes">Back</button>
    </div>
    ${(() => { const pv = ensurePvp(s); const lg = leagueOf(pv.trophies); return `<div class="tiny dim" style="margin:4px 0 2px">PvP · ${esc(lg.name)} · ${pv.trophies} trophies${lg.next ? ` · ${lg.next.min - pv.trophies} to ${lg.next.name}` : ''}</div>`; })()}
    <div class="loadstock">
      ${ico('ammo')} Ammo <b>${fmt(s.ammo)}</b>/${fmt(cap.ammo)} · loading ${usedA}
      · ${ico('medkits')} Medkits <b>${fmt(s.medkits)}</b>/${fmt(cap.medkits)} · loading ${usedM}
      · ${ico('parts')} Parts <b>${fmt(s.parts)}</b>
    </div>
    <div class="loadgrid">
      ${[0,1,2,3].filter((i) => d.squad[i] || Object.keys(s.heroes.owned).some((h) => !d.squad.includes(h))).map((i) => slot(ctx, d, i)).join('')}
    </div>
    <div class="loadgear">
      <div class="tiny dim">Workshop gear (spend parts, then assign to a squad member)</div>
      <div class="row" style="flex-wrap:wrap;gap:6px;margin-top:4px">
        ${KIT_ORDER.map((id) => {
          const k = KIT[id];
          const n = inventoryCount(s, id);
          const tag = k.class ? ` · ${k.class}` : '';
          return `<button class="btn sm" data-act="craftKit" data-id="${id}" title="${esc(k.blurb)}">${esc(k.name)}${tag} · ${n} in stock · ${ico('parts')} ${k.cost}</button>`;
        }).join('')}
      </div>
    </div>
    </div>
    <div class="loadfoot">
      <label class="hstakes ${d.highStakes ? 'on' : ''}">
        <input type="checkbox" data-act="toggleHighStakes" ${d.highStakes ? 'checked' : ''}>
        <span><b>High Stakes</b> — triple rewards. If an operator is KO'd they stay in the crew, but their level resets and any gear they carried is taken. Normal fights have no such penalty.</span>
      </label>
      <button class="btn red" data-act="confirmLoadout">${d.highStakes ? 'Confirm High Stakes' : 'Start fight'}</button>
    </div>
  </div>`;
}

function slot(ctx, d, i) {
  const s = ctx.state;
  const id = d.squad[i];
  if (!id) {
    const rest = Object.keys(s.heroes.owned).filter((h) => !d.squad.includes(h));
    return `<article class="loadslot empty"><div class="tiny dim">Empty slot</div>
      ${rest.map((h) => `<button class="btn sm" data-act="addLoadHero" data-id="${h}">+ ${esc(HEROES[h].name)}</button>`).join('') || '<span class="tiny dim">No more operators</span>'}
    </article>`;
  }
  const h = HEROES[id], rec = s.heroes.owned[id];
  const capA = carryOf(s, id), capM = medCarry(s, id);
  const a = d.ammo[id] || 0, m = d.medkits[id] || 0;
  return `<article class="loadslot">
    <img src="${h.portrait}" alt="">
    <div class="grow">
      <div class="hn">${esc(h.name)} <span class="tiny dim">Lv ${rec.lv || 1} ${esc(rankName(rec.lv || 1))}${rec.gear ? ' · ' + esc(KIT[rec.gear].name) : ''}</span>
        <button class="x sm" data-act="dropLoadHero" data-id="${id}">✕</button></div>
      <div class="loadrow">
        <span>${ico('ammo')}</span>
        <button class="btn sm" data-act="nudgeAmmo" data-id="${id}" data-d="-1">−</button>
        <b>${a}</b>/${capA}
        <button class="btn sm" data-act="nudgeAmmo" data-id="${id}" data-d="1">+</button>
        <span class="gap">${ico('medkits')}</span>
        <button class="btn sm" data-act="nudgeMed" data-id="${id}" data-d="-1">−</button>
        <b>${m}</b>/${capM}
        <button class="btn sm" data-act="nudgeMed" data-id="${id}" data-d="1">+</button>
      </div>
      <div class="loadrow">Gear
        <select data-act="setLoadGear" data-id="${id}">
          <option value="">None</option>
          ${KIT_ORDER.filter((k) => kitFits(id, k)).map((k) => `<option value="${k}" ${rec.gear === k ? 'selected' : ''} ${inventoryCount(s, k) < 1 && rec.gear !== k ? 'disabled' : ''}>${esc(KIT[k].name)} (${esc(KIT[k].blurb)})</option>`).join('')}
        </select>
      </div>
    </div>
  </article>`;
}

function remainingAmmo(s, d, except) {
  const used = d.squad.reduce((n, id) => n + (id === except ? 0 : (d.ammo[id] || 0)), 0);
  return Math.max(0, (s.ammo || 0) - used);
}
function remainingMed(s, d, except) {
  const used = d.squad.reduce((n, id) => n + (id === except ? 0 : (d.medkits[id] || 0)), 0);
  return Math.max(0, (s.medkits || 0) - used);
}

export const actions = {
  addLoadHero(ctx, el) {
    const d = ensure(ctx);
    if (d.squad.length >= 4) return ctx.toast('Squad is full.');
    if (!ctx.state.heroes.owned[el.dataset.id]) return;
    if (d.squad.includes(el.dataset.id)) return;
    d.squad.push(el.dataset.id);
    const fresh = defaultLoadout(ctx.state, d.squad);
    d.ammo = fresh.ammo; d.medkits = fresh.medkits;
    setSquad(ctx.state, d.squad);
    ctx.render();
  },
  dropLoadHero(ctx, el) {
    const d = ensure(ctx);
    if (d.squad.length <= 1) return ctx.toast('You need at least one operator.');
    d.squad = d.squad.filter((id) => id !== el.dataset.id);
    delete d.ammo[el.dataset.id]; delete d.medkits[el.dataset.id];
    setSquad(ctx.state, d.squad);
    ctx.render();
  },
  nudgeAmmo(ctx, el) {
    const d = ensure(ctx), id = el.dataset.id, delta = +el.dataset.d;
    const cap = Math.min(carryOf(ctx.state, id), remainingAmmo(ctx.state, d, id));
    d.ammo[id] = Math.max(0, Math.min(cap, (d.ammo[id] || 0) + delta));
    ctx.render();
  },
  nudgeMed(ctx, el) {
    const d = ensure(ctx), id = el.dataset.id, delta = +el.dataset.d;
    const cap = Math.min(medCarry(ctx.state, id), remainingMed(ctx.state, d, id));
    d.medkits[id] = Math.max(0, Math.min(cap, (d.medkits[id] || 0) + delta));
    ctx.render();
  },
  setLoadGear(ctx, el) {
    const r = equipGear(ctx.state, el.dataset.id, el.value || null);
    if (!r.ok) ctx.toast(r.reason);
    ctx.render();
  },
  craftKit(ctx, el) {
    const r = craftKit(ctx.state, el.dataset.id);
    if (!r.ok) return ctx.toast(r.reason);
    Audio.play('build');
    ctx.toast(`Made a ${r.name}.`);
    ctx.render();
  },
  toggleHighStakes(ctx) {
    const d = ensure(ctx);
    if (d.highStakes) { d.highStakes = false; return ctx.render(); }
    ctx.modal(`<div class="result loss">
      <div class="h" style="font-size:22px">High Stakes</div>
      <p class="small">Rewards are tripled. This is <b>not</b> permadeath: a KO'd operator stays in your crew.</p>
      <p class="small">But if they go down, their XP and level reset to Rookie, their perks are lost, and any gear they carried is taken by the other side. Spent ammo and medkits are gone in every mode.</p>
      <div class="row" style="margin-top:12px">
        <button class="btn red block" data-act="acceptHighStakes">I understand — play High Stakes</button>
        <button class="btn block" data-act="closeModal">Cancel</button>
      </div>
    </div>`, { center: true });
  },
  acceptHighStakes(ctx) {
    ensure(ctx).highStakes = true;
    ctx.closeModal();
    ctx.render();
  },
  confirmLoadout(ctx) {
    const d = ensure(ctx);
    const r = commitLoadout(ctx.state, d);
    if (!r.ok) return ctx.toast(r.reason);
    ctx.state.tactics = startStreet(ctx.state, ctx.state.rng, r);
    ctx.sub.tactics = null;
    ctx.sub.loadout = null;
    ctx.sub.afterBattle = 'heroes';
    ctx.go('tactics');
  },
};

export function openLoadout(ctx) {
  ctx.sub.loadout = { draft: defaultLoadout(ctx.state), confirmHS: false };
  ctx.go('loadout');
}
