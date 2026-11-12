// Operators roster: unique collectable heroes, shard progress, pin-a-target, squad of up to 4.
import { HERO_ORDER, HEROES, unlockHint, setSquad, synergiesFor } from '../core/heroes.js';
import { startTutorial, startStreet } from '../core/tactics.js';
import { money, fmt, ico, esc } from './fmt.js';
import * as Audio from './audio.js';
import {
  SHARDS_TO_UNLOCK, MAX_STARS, STAR_COST, progressOf, shardCount, setPin,
  spendUniversal, featuredHero, featuredUntil, formatDrop,
} from '../core/shards.js';

export function render(ctx) {
  const s = ctx.state, now = ctx.now();
  const owned = s.heroes.owned || {};
  const squad = s.heroes.squad || [];
  const syn = synergiesFor(squad);
  const feat = featuredHero(now);
  const days = Math.max(1, Math.ceil((featuredUntil(now) - now) / 86400000));
  return `
  <div class="heroscr">
    <div class="armyhead">
      <div>
        <div class="h">Operators</div>
        <div class="tiny dim">Rook is yours from the street lesson. Everyone else is unlocked with 30 shards — found in bushes, missions and Ice crates. Pin a target to boost their drop rate.</div>
      </div>
      <div class="row">
        ${s.heroes.tutorialDone ? '' : '<button class="btn gold" data-act="startTutorial">Street lesson</button>'}
        <button class="btn red" data-act="startStreet" ${squad.length ? '' : 'disabled'}>Street fight</button>
      </div>
    </div>
    <div class="tiny dim" style="margin:4px 0 8px">
      Squad ${squad.length}/4 · ${s.heroes.universal || 0} universal shards
      · Weekly feature: <b>${esc(HEROES[feat].name)}</b> (${days}d left)
      ${s.heroes.pin ? ` · Pinned: <b>${esc(HEROES[s.heroes.pin].name)}</b>` : ' · No pin yet'}
      ${syn.length ? ' · Synergy: ' + syn.map((g) => `<b>${esc(g.name)}</b>`).join(', ') : ''}
    </div>
    <div class="herogrid">
      ${HERO_ORDER.map((id) => card(s, id, owned[id], squad.includes(id), feat, now)).join('')}
    </div>
  </div>`;
}

function starsRow(n) {
  n = n || 0;
  return '<span class="stars">' + '★'.repeat(n) + '☆'.repeat(Math.max(0, MAX_STARS - n)) + '</span>';
}

function bar(have, need) {
  if (!need) return `<div class="sbar"><i style="width:100%"></i></div><div class="tiny dim">Max stars — extras become universal shards</div>`;
  const pct = Math.min(100, (have / need) * 100);
  return `<div class="sbar"><i style="width:${pct}%"></i></div><div class="tiny">${have}/${need} shards</div>`;
}

function card(s, id, rec, inSquad, feat, now) {
  const h = HEROES[id];
  const have = rec ? true : false;
  const prog = progressOf(s, id);
  const pinned = s.heroes.pin === id;
  const featured = feat === id;
  const canPin = id !== 'rook';
  return `<article class="hcard ${have ? '' : 'locked'} ${inSquad ? 'in' : ''} ${pinned ? 'pinned' : ''} ${featured ? 'feat' : ''}" data-act="${have ? 'toggleSquad' : 'heroInfo'}" data-id="${id}">
    <img src="${h.portrait}" alt="${esc(h.name)}">
    ${inSquad ? '<span class="squadtag">SQUAD</span>' : ''}
    ${featured ? '<span class="feattag">FEATURED</span>' : ''}
    ${pinned ? '<span class="pintag">PINNED</span>' : ''}
    <div class="hmeta">
      <div class="hn">${esc(h.name)} ${have ? starsRow(prog.stars) : ''} <span class="tiny dim">${esc(h.species)} · ${esc(h.role)}</span></div>
      <div class="tiny dim">${esc(h.blurb)}</div>
      <div class="tiny">HP ${h.hp}${prog.stars > 1 ? `+${prog.stars - 1}` : ''} · AP ${h.ap} · Aim ${h.aim}${prog.stars > 1 ? `+${prog.stars - 1}` : ''} · ${esc(h.weapon.name)} ${h.weapon.dmg[0]}–${h.weapon.dmg[1]}</div>
      <div class="tiny gold">${esc(h.passive.name)} — ${esc(h.passive.text)}</div>
      ${id === 'rook' ? '<div class="tiny dim">Story operator — given in the street lesson.</div>' : bar(prog.have, prog.need)}
      <div class="row" style="gap:4px;margin-top:4px;flex-wrap:wrap">
        ${canPin ? `<button class="btn sm ${pinned ? 'gold' : ''}" data-act="pinHero" data-id="${id}">${pinned ? 'Unpin' : 'Pin'}</button>` : ''}
        ${s.heroes.universal && (prog.need || !have) ? `<button class="btn sm" data-act="useUniversal" data-id="${id}">Use universal</button>` : ''}
      </div>
    </div>
  </article>`;
}

export const actions = {
  toggleSquad(ctx, el) {
    if (el.closest('button')) return; // let inner buttons fire their own act
    const id = el.dataset.id;
    const squad = ctx.state.heroes.squad.slice();
    const i = squad.indexOf(id);
    if (i >= 0) {
      if (squad.length === 1) return ctx.toast('You need at least one operator in the squad.');
      squad.splice(i, 1);
    } else {
      if (squad.length >= 4) return ctx.toast('Squad is full (4). Drop someone first.');
      squad.push(id);
    }
    const r = setSquad(ctx.state, squad);
    if (!r.ok) return ctx.toast(r.reason);
    ctx.render();
  },
  heroInfo(ctx, el) {
    if (el.closest && false) return;
    const h = HEROES[el.dataset.id];
    if (!h) return;
    ctx.toast(`${h.name}: ${unlockHint(ctx.state, h.id)}. Pin them to boost shard drops.`);
  },
  pinHero(ctx, el) {
    const id = el.dataset.id;
    const cur = ctx.state.heroes.pin;
    const r = setPin(ctx.state, cur === id ? null : id);
    if (!r.ok) return ctx.toast(r.reason);
    ctx.toast(r.pin ? `${HEROES[r.pin].name} is pinned. Their shards drop more often.` : 'Pin cleared.');
    ctx.render();
  },
  useUniversal(ctx, el) {
    const id = el.dataset.id;
    const prog = progressOf(ctx.state, id);
    const need = prog.need ? prog.need - prog.have : 0;
    const n = Math.min(ctx.state.heroes.universal, need || ctx.state.heroes.universal);
    const r = spendUniversal(ctx.state, id, n);
    if (!r.ok) return ctx.toast(r.reason);
    Audio.play('collect');
    ctx.toast(formatDrop(r) || 'Spent universal shards.');
    ctx.render();
  },
  startTutorial(ctx) {
    ctx.state.tactics = startTutorial(ctx.state.rng);
    ctx.sub.tactics = null;
    ctx.sub.afterBattle = 'base';
    ctx.go('tactics');
  },
  startStreet(ctx) {
    if (!ctx.state.heroes.squad.length) return ctx.toast('Pick a squad first.');
    ctx.state.tactics = startStreet(ctx.state, ctx.state.rng);
    ctx.sub.tactics = null;
    ctx.sub.afterBattle = 'heroes';
    ctx.go('tactics');
  },
};
