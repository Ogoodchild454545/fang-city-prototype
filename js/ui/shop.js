// Mock storefront. Shows how monetisation would look; no payment code exists in the prototype.
import { SHOP } from '../core/data.js';
import { CRATES, featuredHero, featuredUntil, pityOf, openCrate, formatDrop } from '../core/shards.js';
import { HEROES } from '../core/heroes.js';
import * as E from '../core/economy.js';
import * as M from '../core/meta.js';
import * as BS from '../core/base.js';
import * as C from '../core/crew.js';
import { fmt, money, dur, ico, esc } from './fmt.js';


function crateBlock(s, now) {
  const feat = featuredHero(now);
  const days = Math.max(1, Math.ceil((featuredUntil(now) - now) / 86400000));
  const pin = s.heroes?.pin && HEROES[s.heroes.pin];
  const card = (kind) => {
    const c = CRATES[kind];
    const p = pityOf(s, kind);
    return `<div class="card cratecard">
      <div class="h">${esc(c.name)}</div>
      <div class="tiny dim">${esc(c.blurb)}</div>
      <div class="tiny" style="margin-top:4px">${c.odds.map((o) => `${Math.round(o.p * 100)}% ${esc(o.label)}`).join(' · ')}</div>
      <div class="tiny gold">Pity ${p.have}/${p.need} · ${esc(c.pity)}</div>
      <button class="btn gold block" style="margin-top:6px" data-act="openCrate" data-kind="${kind}">Open · ${ico('teeth')} ${c.cost}</button>
    </div>`;
  };
  return `<div class="sect">Operator crates ${ico('teeth')}</div>
    <div class="card" style="margin-bottom:8px"><div class="tiny gold h">Weekly feature</div>
      <div class="small"><b>${esc(HEROES[feat].name)}</b> (${esc(HEROES[feat].species)}) drops more often for ${days} more day${days > 1 ? 's' : ''}. ${pin ? `Pinned: ${esc(pin.name)} gets an even bigger boost.` : 'Pin a target on the Operators screen to focus your drops.'}</div></div>
    <div class="grid2">${card('street')}${card('vault')}</div>
    <div class="tiny faint" style="margin:6px 0 10px">Paid with Ice you already have (earned or from the mock Ice packs below). No real charge. Duplicate shards raise star level; extras at 5★ become universal shards.</div>`;
}

export function render(ctx) {
  const s = ctx.state, now = ctx.now();
  const starterOwned = s.purchases.starter;
  const vipLeft = s.vipUntil > now ? Math.ceil((s.vipUntil - now) / 86400000) : 0;
  const offer = (o) => {
    const owned = o.once && s.purchases[o.id];
    const active = (o.id === 'vip' && vipLeft) || (o.id === 'pass' && s.pass);
    return `<div class="card"><div class="row"><div class="grow"><div class="h">${o.name}</div><div class="tiny dim">${o.desc}</div>
      ${o.id === 'vip' && vipLeft ? `<div class="tiny gold">Active · ${vipLeft} days left</div>` : ''}</div>
      <button class="btn sm ${owned ? '' : 'gold'}" data-act="buy" data-kind="offer" data-id="${o.id}" ${owned ? 'disabled' : ''}>${owned ? 'Owned' : active ? 'Extend · ' + o.price : o.price}</button></div></div>`;
  };
  return `
  <div class="title"><span class="h">Market</span><span class="sub">/ Shop</span></div>
  <div class="proto">PROTOTYPE: no real payments. Tapping a price grants the item instantly so you can feel the economy. Prices are proposals in GBP.</div>

  ${crateBlock(s, now)}

  ${starterOwned ? '' : `<div class="card featured"><div class="row">
    <div class="img" style="background-image:url(assets/fox.jpg)"></div>
    <div class="grow"><div class="tiny gold h">One-time offer</div><div class="h" style="font-size:20px">Starter Crate</div>
      <div class="tiny dim">${SHOP.offers[0].desc}</div>
      <button class="btn red" style="margin-top:6px" data-act="buy" data-kind="offer" data-id="starter">${SHOP.offers[0].price}</button></div></div></div>`}

  <div class="sect">Ice ${ico('teeth')}</div>
  <div class="packs">${SHOP.teeth.map((p) => `<button class="pack" data-act="buy" data-kind="teeth" data-id="${p.id}">
    ${p.tag ? `<span class="tag">${p.tag}</span>` : ''}<div style="font-size:22px">${ico('teeth', 'ico-img lg')}</div><div class="amt">${fmt(p.teeth)}</div>
    ${!s.purchases['first_' + p.id] ? '<div class="tiny green">x2 first buy</div>' : '<div class="tiny">&nbsp;</div>'}
    <div class="btn sm block" style="margin-top:4px">${p.price}</div></button>`).join('')}</div>

  <div class="sect">Memberships & upgrades</div>
  <div class="grid2">${SHOP.offers.slice(1).map(offer).join('')}</div>

  <div class="sect">Free rewards</div>
  <div class="card"><div class="row"><div class="grow"><div class="h">Watch an ad: x2 cash production for 30 min</div><div class="tiny dim">Optional, stacks to 4h, ${6 - (s.boosts.adsDay === new Date(now).toISOString().slice(0, 10) ? s.boosts.adsToday : 0)} left today.</div></div>
    <button class="btn sm" data-act="adBoostShop">▶ Watch</button></div></div>

  <div class="sect">Cosmetics (no stats)</div>
  ${SHOP.cosmetics.map((c) => `<div class="card"><div class="row"><div class="grow"><div class="h">${c.name}</div><div class="tiny dim">${c.desc}</div></div>
    <button class="btn sm ${s.purchases[c.id] ? '' : 'gold'}" data-act="buy" data-kind="cosmetic" data-id="${c.id}" ${s.purchases[c.id] ? 'disabled' : ''}>${s.purchases[c.id] ? 'Owned' : c.price}</button></div></div>`).join('')}

  <div class="sect">Fair play promise</div>
  <div class="card tiny dim">Ranked raids use level-matched brackets, nothing in the shop can be bought only with money that free players can't also earn, odds are always shown, and the pity counter is visible. Spending saves time; skill and tactics win fights.</div>

  <div class="sect">Prototype tools</div>
  <div class="card"><div class="row" style="flex-wrap:wrap;gap:6px">
    <button class="btn sm" data-act="dbgTime" data-h="1">Skip 1h (test offline)</button>
    <button class="btn sm" data-act="dbgTime" data-h="8">Skip 8h</button>
    <button class="btn sm" data-act="dbgCash">Fill storage + 500 Ice</button>
    <button class="btn sm" data-act="dbgReset">Reset save</button>
  </div><div class="tiny faint" style="margin-top:6px">For play-testing only. Not in the real game.</div></div>`;
}

export const actions = {
  openCrate(ctx, el) {
    const r = openCrate(ctx.state, el.dataset.kind, ctx.now());
    if (!r.ok) return ctx.toast(r.reason);
    const pity = r.pity ? 'Pity hit! ' : '';
    const text = r.universal && !r.id ? `${pity}+${r.added} universal shards` : (pity + formatDrop(r));
    ctx.toast(r.unlocked ? `${text} — they joined your operators!` : text);
    ctx.render();
  },
  buy(ctx, el) {
    const r = M.mockPurchase(ctx.state, el.dataset.kind, el.dataset.id, ctx.now());
    ctx.toast(r.ok ? `Prototype purchase: ${r.text}` : r.text);
    ctx.render();
  },
  adBoostShop(ctx) {
    const r = E.watchIncomeAd(ctx.state, ctx.now());
    ctx.toast(r.ok ? 'Reward ad (mock) watched: income x2 for 30 min' : 'Daily ad limit reached');
    ctx.render();
  },
  dbgTime(ctx, el) {
    ctx.save();
    const s = ctx.state;
    const h = +el.dataset.h;
    // Simulate being away: rewind lastTick, then run the same offline routine a real return uses.
    const ms = h * 3600 * 1000;
    s.lastTick -= ms;
    if (s.queueAt) s.queueAt -= ms;
    if (s.research) s.research.endsAt -= ms;
    for (const b of Object.values(s.bosses || {})) if (b.restUntil) b.restUntil -= ms;
    for (const b of s.base.buildings) if (b.job) b.job.endsAt -= ms;
    for (const o of s.base.obstacles) if (o.clr) o.clr.endsAt -= ms;
    if (s.base.spawnAt) s.base.spawnAt -= ms;
    const sum = E.applyOffline(s, ctx.now());
    C.finishQueue(s, ctx.now()); C.finishResearch(s, ctx.now());
    ctx.render();
    if (sum) ctx.modal(`<div class="result win"><div class="h dim">While you were away (${dur(sum.seconds)})</div><div class="big">${money(sum.banked + sum.tills)}</div>
      <div class="dim small">${money(sum.banked)} banked by lieutenants · ${money(sum.tills)} waiting to collect${sum.influence >= 1 ? ` · ${ico('influence')} ${Math.floor(sum.influence)} Rep` : ''}${sum.finished ? ` · ${sum.finished} builds finished` : ''}${sum.cleared ? ` · ${sum.cleared} cleared` : ''}</div>
      <button class="btn block" style="margin-top:12px" data-act="closeModal">Collect</button></div>`, { center: true });
  },
  dbgCash(ctx) { BS.gain(ctx.state, 'cash', 1e6); BS.gain(ctx.state, 'influence', 5000); ctx.state.teeth += 500; ctx.toast('Filled storage + 500 Ice (test)'); ctx.render(); },
  dbgReset(ctx) { localStorage.clear(); location.href = location.pathname; },
};
