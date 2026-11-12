// Mock storefront. Shows how monetisation would look; no payment code exists in the prototype.
import { SHOP } from '../core/data.js';
import * as E from '../core/economy.js';
import * as M from '../core/meta.js';
import * as BS from '../core/base.js';
import { fmt, money, dur } from './fmt.js';

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

  ${starterOwned ? '' : `<div class="card featured"><div class="row">
    <div class="img" style="background-image:url(assets/fox.jpg)"></div>
    <div class="grow"><div class="tiny gold h">One-time offer</div><div class="h" style="font-size:20px">Starter Crate</div>
      <div class="tiny dim">${SHOP.offers[0].desc}</div>
      <button class="btn red" style="margin-top:6px" data-act="buy" data-kind="offer" data-id="starter">${SHOP.offers[0].price}</button></div></div></div>`}

  <div class="sect">Gold Teeth 🦷</div>
  <div class="packs">${SHOP.teeth.map((p) => `<button class="pack" data-act="buy" data-kind="teeth" data-id="${p.id}">
    ${p.tag ? `<span class="tag">${p.tag}</span>` : ''}<div style="font-size:22px">🦷</div><div class="amt">${fmt(p.teeth)}</div>
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
    <button class="btn sm" data-act="dbgCash">Fill storage + 500 🦷</button>
    <button class="btn sm" data-act="dbgReset">Reset save</button>
  </div><div class="tiny faint" style="margin-top:6px">For play-testing only. Not in the real game.</div></div>`;
}

export const actions = {
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
    s.lastTick -= h * 3600 * 1000;
    const ms = h * 3600 * 1000;
    for (const t of s.training) t.endsAt -= ms;
    for (const b of s.base.buildings) if (b.job) b.job.endsAt -= ms;
    for (const o of s.base.obstacles) if (o.clr) o.clr.endsAt -= ms;
    if (s.base.spawnAt) s.base.spawnAt -= ms;
    const sum = E.applyOffline(s, ctx.now());
    ctx.render();
    if (sum) ctx.modal(`<div class="result win"><div class="h dim">While you were away (${dur(sum.seconds)})</div><div class="big">${money(sum.banked + sum.tills)}</div>
      <div class="dim small">${money(sum.banked)} banked by lieutenants · ${money(sum.tills)} waiting to collect${sum.influence >= 1 ? ` · 🐾 ${Math.floor(sum.influence)}` : ''}${sum.finished ? ` · ${sum.finished} builds finished` : ''}${sum.cleared ? ` · ${sum.cleared} cleared` : ''}</div>
      <button class="btn block" style="margin-top:12px" data-act="closeModal">Collect</button></div>`, { center: true });
  },
  dbgCash(ctx) { BS.gain(ctx.state, 'cash', 1e6); BS.gain(ctx.state, 'influence', 5000); ctx.state.teeth += 500; ctx.toast('Filled storage + 500 🦷 (test)'); ctx.render(); },
  dbgReset(ctx) { localStorage.clear(); location.href = location.pathname; },
};
