// Operators roster: unique collectable heroes, shard progress, pin-a-target, squad of up to 4.
import { squadCap, isUnlocked, unlockLv, isAvailable } from '../core/progression.js';
import { HERO_ORDER, HEROES, unlockHint, setSquad, synergiesFor, classOf, speciesPerk, CLASSES } from '../core/heroes.js';
import { startTutorial } from '../core/tactics.js';
import { money, fmt, ico, esc } from './fmt.js';
import * as Audio from './audio.js';
import { openLoadout } from './loadout.js';
import { rankName, xpToNext, PERKS, pickPerk } from '../core/progress.js';
import { KIT } from '../core/loadout.js';
import { statsFor, equippedIds } from '../core/items.js';
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
  const locked = HERO_ORDER.filter((id) => !owned[id]).length;
  // v0.9.3: one-line header + compact chips; the explanation lives behind (i). Cards scroll sideways.
  return `
  <div class="heroscr opsscr">
    <div class="opshead">
      <span class="h opstitle">Operators</span>
      <button class="infob" data-act="opsInfo" title="How operators work" aria-label="How operators work">i</button>
      <div class="opschips">
        <span class="opchip" title="Squad size grows with your player level">👥 Squad <b>${squad.length}/${squadCap(s)}</b></span>
        <span class="opchip" title="Universal shards: spend on any operator">💠 <b>${s.heroes.universal || 0}</b> universal</span>
        <span class="opchip" title="Weekly featured operator drops more often">⭐ <b>${esc(HEROES[feat].name)}</b> ${days}d</span>
        <span class="opchip" title="Pinned target gets boosted shard drops">📌 ${s.heroes.pin ? `<b>${esc(HEROES[s.heroes.pin].name)}</b>` : 'No pin'}</span>
        ${syn.length ? `<span class="opchip gold" title="Squad synergy">${syn.map((g) => esc(g.name)).join(', ')}</span>` : ''}
      </div>
      <div class="opsbtns">
        ${s.heroes.tutorialDone ? '' : '<button class="btn sm gold" data-act="startTutorial">Lesson</button>'}
        <button class="btn sm red" data-act="nav" data-tab="missions">🎯 Ops</button>
        ${isUnlocked(s, 'pvpcopy') ? `<button class="btn sm" data-act="startStreet" ${squad.length ? '' : 'disabled'}>⚔ PvP</button>` : `<button class="btn sm off" data-act="lockedFeature" data-id="pvpcopy">🔒 PvP · Lv ${unlockLv('pvpcopy')}</button>`}
        <button class="btn sm" data-act="openEditor" title="Map editor">🗺 Maps</button>
      </div>
    </div>
    <div class="opsrow">
      ${HERO_ORDER.filter((id) => owned[id]).map((id) => opCard(s, id, owned[id], squad.includes(id), feat)).join('')}
      ${locked ? `<button class="opcard recruitc" data-act="recruitList"><span class="rq">?</span><b class="h">Recruit</b><span class="tiny dim">${locked} more operators</span><span class="tiny">30 shards unlocks one</span><span class="btn sm">Shard progress</span></button>` : ''}
    </div>
  </div>`;
}

// Locked operator card for the Recruit pop-up: portrait, class, perk, shard progress, pin.
function lockCard(s, id, feat) {
  const h = HEROES[id], prog = progressOf(s, id), pk = speciesPerk(h.species), pinned = s.heroes.pin === id;
  return `<article class="opcard lockc ${pinned ? 'in' : ''}" data-act="heroInfo" data-id="${id}">
    <div class="opport" style="background-image:url(${h.portrait})">${feat === id ? '<span class="feattag">FEATURED</span>' : ''}${pinned ? '<span class="pintag">PINNED</span>' : ''}</div>
    <div class="opmeta">
      <div class="opname"><b class="h">${esc(h.name)}</b></div>
      <div class="tiny gold">${esc(h.species)} · ${esc((classOf(h) || {}).name || h.role)}</div>
      ${pk ? `<div class="opperk tiny"><b>${esc(pk.name)}</b> ${esc(pk.text)}</div>` : ''}
      <div class="opstats"><span>HP <b>${h.hp}</b></span><span>AP <b>${h.ap}</b></span><span>Aim <b>${h.aim}</b></span></div>
      ${bar(prog.have, prog.need)}
      <div class="opbtns">
        <button class="btn sm ${pinned ? 'gold' : ''}" data-act="pinHero" data-id="${id}">${pinned ? 'Unpin' : 'Pin'}</button>
        ${s.heroes.universal ? `<button class="btn sm" data-act="useUniversal" data-id="${id}">Use universal</button>` : ''}
      </div>
    </div>
  </article>`;
}

// Big roster card for the Operators screen (portrait left, key facts right; nothing truncated).
function opCard(s, id, rec, inSquad, feat) {
  const h = HEROES[id], prog = progressOf(s, id);
  const st = statsFor(id, { stars: rec.stars, lv: rec.lv, perks: rec.perks, gear: rec.gear, equip: rec.equip || {} });
  const pk = speciesPerk(h.species);
  const lv = rec.lv || 1, need = xpToNext(lv);
  const pct = need ? Math.min(100, ((rec.xp || 0) / need) * 100) : 100;
  const pinned = s.heroes.pin === id;
  return `<article class="opcard ${inSquad ? 'in' : ''}" data-act="openHero" data-id="${id}">
    <div class="opport" style="background-image:url(${h.portrait})">
      ${inSquad ? '<span class="squadtag">SQUAD</span>' : ''}${feat === id ? '<span class="feattag">FEATURED</span>' : ''}${pinned ? '<span class="pintag">PINNED</span>' : ''}
      <span class="oplv">Lv ${lv}</span>
    </div>
    <div class="opmeta">
      <div class="opname"><b class="h">${esc(h.name)}</b>${starsRow(prog.stars)}</div>
      <div class="tiny gold">${esc(h.species)} · ${esc((classOf(h) || {}).name || h.role)} · ${esc(rankName(lv))}</div>
      <div class="xpbar"><i style="width:${pct}%"></i></div>
      <div class="tiny dim">${need ? `${rec.xp || 0}/${need} XP` : 'Max rank'}</div>
      ${pk ? `<div class="opperk tiny"><b>${esc(pk.name)}</b> ${esc(pk.short || pk.text)}</div>` : ''}
      <div class="opstats"><span>HP <b>${st.hp}</b></span><span>AP <b>${st.ap}</b></span><span>Aim <b>${st.aim}</b></span><span>Gear <b>${equippedIds(rec).length}</b></span></div>
      ${rec.pendingPerk ? perkRow(id, rec) : ''}
      <div class="opbtns">
        <button class="btn sm gold" data-act="openHero" data-id="${id}">Gear &amp; abilities</button>
        <button class="btn sm ${inSquad ? '' : 'dim'}" data-act="toggleSquad" data-id="${id}">${inSquad ? 'In squad ✓' : 'Add to squad'}</button>
      </div>
    </div>
  </article>`;
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
  const st = have ? statsFor(id, { stars: rec.stars, lv: rec.lv, perks: rec.perks, gear: rec.gear, equip: rec.equip || {} }) : null;
  return `<article class="hcard ${have ? '' : 'locked'} ${inSquad ? 'in' : ''} ${pinned ? 'pinned' : ''} ${featured ? 'feat' : ''}" data-act="${have ? 'openHero' : 'heroInfo'}" data-id="${id}">
    <img src="${h.portrait}" alt="${esc(h.name)}">
    ${inSquad ? '<span class="squadtag">SQUAD</span>' : ''}
    ${featured ? '<span class="feattag">FEATURED</span>' : ''}
    ${pinned ? '<span class="pintag">PINNED</span>' : ''}
    <div class="hmeta">
      <div class="hn">${esc(h.name)} ${have ? starsRow(prog.stars) : ''} <span class="tiny dim">${esc(h.species)} · ${esc((classOf(h) || {}).name || h.role)}</span></div>
      <div class="tiny gold">${(() => { const pk = speciesPerk(h.species); return pk ? `${esc(pk.name)} — ${esc(pk.text)}` : ''; })()}</div>
      <div class="hbio tiny dim">${esc(h.bio || h.blurb)}</div>
      ${st ? `<div class="tiny">HP ${st.hp} · AP ${st.ap} · Aim ${st.aim}${st.mel ? ` · ${esc(st.mel.name)} ${st.mel.dmg[0] + st.mdmg}–${st.mel.dmg[1] + st.mdmg}` : ''}${st.gun ? ` · ${esc(st.gun.name)} ${st.gun.dmg[0] + st.rdmg}–${st.gun.dmg[1] + st.rdmg}` : ''} · ${equippedIds(rec).length} gear</div>`
        : `<div class="tiny">HP ${h.hp} · AP ${h.ap} · Aim ${h.aim} · ${esc(h.weapon.name)} ${h.weapon.dmg[0]}–${h.weapon.dmg[1]}</div>`}
      ${have ? xpbar(rec) : ''}
      ${h.passive && h.passive.name ? `<div class="tiny dim">${esc(h.passive.name)} — ${esc(h.passive.text)}</div>` : ''}
      ${id === 'rook' ? '<div class="tiny dim">Story operator — given in the street lesson.</div>' : bar(prog.have, prog.need)}
      ${have && rec.pendingPerk ? perkRow(id, rec) : ''}
      <div class="row" style="gap:4px;margin-top:4px;flex-wrap:wrap">
        ${have ? `<button class="btn sm gold" data-act="openHero" data-id="${id}">Gear &amp; abilities</button><button class="btn sm ${inSquad ? '' : 'dim'}" data-act="toggleSquad" data-id="${id}">${inSquad ? 'In squad ✓' : 'Add to squad'}</button>` : ''}
        ${canPin ? `<button class="btn sm ${pinned ? 'gold' : ''}" data-act="pinHero" data-id="${id}">${pinned ? 'Unpin' : 'Pin'}</button>` : ''}
        ${s.heroes.universal && (prog.need || !have) ? `<button class="btn sm" data-act="useUniversal" data-id="${id}">Use universal</button>` : ''}
      </div>
    </div>
  </article>`;
}


function xpbar(rec) {
  const lv = rec.lv || 1;
  const need = xpToNext(lv);
  const pct = need ? Math.min(100, ((rec.xp || 0) / need) * 100) : 100;
  const gear = rec.gear && KIT[rec.gear] ? ' · ' + KIT[rec.gear].name : '';
  const perks = (rec.perks || []).map((id) => PERKS[id]?.name).filter(Boolean);
  return `<div class="xpbar" title="Experience"><i style="width:${pct}%"></i></div>
    <div class="tiny">Lv ${lv} ${esc(rankName(lv))} · ${need ? `${rec.xp || 0}/${need} XP` : 'Max rank'}${gear}${perks.length ? ' · ' + esc(perks.join(', ')) : ''}</div>`;
}

function perkRow(id, rec) {
  const choices = rec.pendingChoices && rec.pendingChoices.length
    ? rec.pendingChoices
    : null;
  if (!choices) return `<div class="tiny gold">Level-up perk ready after the next fight debrief.</div>`;
  return `<div class="perkpick">Pick a perk: ${choices.map((p) => `<button class="btn sm" data-act="pickPerk" data-id="${id}" data-perk="${p}">${esc(PERKS[p].name)}</button>`).join('')}</div>`;
}

export const actions = {
  opsInfo(ctx) {
    const s = ctx.state, now = ctx.now(), feat = featuredHero(now);
    ctx.modal(`<div class="h" style="font-size:20px">How operators work</div>
      <ul class="small opsinfo">
        <li>Operators are your heroes for turn-based fights. Every crew starts with <b>Rook</b>.</li>
        <li>Tap an operator for their full inventory (13 gear slots) and wolf/species abilities. Gear changes their stats in battle.</li>
        <li>Operators level up with XP from fights and unlock abilities and perk picks.</li>
        <li>More operators join with <b>30 shards</b> from bushes, missions and Ice crates. Extra shards add stars.</li>
        <li><b>Pin</b> a locked operator to boost their shard drops. This week's featured operator is <b>${esc(HEROES[feat].name)}</b>.</li>
        <li>Your <b>squad</b> goes into ops: 1 operator at first, 2 at player level 5, 3 at 7 and 4 at 10. Universal shards can be spent on anyone.</li>
      </ul>`, { center: true });
  },
  recruitList(ctx) {
    const s = ctx.state;
    const feat = featuredHero(ctx.now());
    const rows = HERO_ORDER.filter((id) => !s.heroes.owned[id]).map((id) => lockCard(s, id, feat)).join('');
    ctx.modal(`<div class="h" style="font-size:20px">Recruit operators</div><div class="tiny dim" style="margin-bottom:6px">Locked until you collect 30 shards. Pin one to boost their drops. Swipe for more.</div><div class="opsrow recrow">${rows}</div>`, { cls: 'wide' });
  },
  toggleSquad(ctx, el) {
    const id = el.dataset.id;
    const squad = ctx.state.heroes.squad.slice();
    const i = squad.indexOf(id);
    if (i >= 0) {
      if (squad.length === 1) return ctx.toast('You need at least one operator in the squad.');
      squad.splice(i, 1);
    } else {
      const cap = squadCap(ctx.state);
      if (!isAvailable(ctx.state, id, ctx.now())) return ctx.toast(`${HEROES[id].name} is busy (job or clinic).`);
      if (squad.length >= cap) return ctx.toast(cap < 4 ? `Squad is full (${cap}). Bigger squads at player level ${cap === 1 ? 5 : cap === 2 ? 7 : 10}.` : 'Squad is full (4). Drop someone first.');
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
    if (el.closest('.overlay')) actions.recruitList(ctx); else ctx.render();
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
  pickPerk(ctx, el) {
    const rec = ctx.state.heroes.owned[el.dataset.id];
    if (!rec) return;
    const r = pickPerk(rec, el.dataset.perk);
    if (!r.ok) return ctx.toast(r.reason);
    rec.pendingChoices = null;
    rec.pendingPerk = false;
    ctx.toast(`${r.perk.name} learned.`);
    const box = el.closest('.perkpick');
    if (box) box.innerHTML = `<span class="tiny gold">${esc(r.perk.name)} learned.</span>`;
    ctx.render();
  },
  startTutorial(ctx) {
    ctx.state.tactics = startTutorial(ctx.state, ctx.state.rng);
    ctx.sub.tactics = null;
    ctx.sub.afterBattle = 'base';
    ctx.go('tactics');
  },
  startStreet(ctx) {
    if (!isUnlocked(ctx.state, 'pvpcopy')) return ctx.toast(`PvP opens at player level ${unlockLv('pvpcopy')}`);
    if (!ctx.state.heroes.squad.length) return ctx.toast('Pick a squad first.');
    openLoadout(ctx);
  },
};
