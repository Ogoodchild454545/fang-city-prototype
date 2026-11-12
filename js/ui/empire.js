// Hideout / idle empire screen.
import { RACKETS, GANGS, DISTRICTS } from '../core/data.js';
import * as E from '../core/economy.js';
import * as M from '../core/meta.js';
import { fmt, money, dur, rewardText } from './fmt.js';

const buyN = (ctx) => ctx.sub.buyN || 1;

function buyCount(ctx, def, rk) {
  const n = buyN(ctx);
  if (n === 'max') return Math.max(1, E.maxAffordable(def, rk.level, ctx.state.cash));
  return n;
}

function racketRow(ctx, def) {
  const s = ctx.state, now = ctx.now();
  const rk = s.rackets[def.id];
  const unlocked = E.isRacketUnlocked(s, def);
  if (!unlocked) {
    const d = DISTRICTS.find((x) => x.id === def.req);
    return `<div class="card rk locked"><div class="ic">🔒</div><div><div class="nm">${def.name}</div><div class="tiny dim">Take <b>${d.name}</b> in the City to unlock</div></div><button class="btn sm" data-act="nav" data-tab="city">City</button></div>`;
  }
  const n = buyCount(ctx, def, rk);
  const cost = E.racketCost(def, rk.level, n);
  const inc = E.racketIncome(s, def.id, now);
  const next = E.nextMilestone(rk.level);
  const auto = E.isAuto(s, def.id, now);
  if (rk.level === 0) {
    return `<div class="card rk"><div class="ic">${def.icon}</div><div><div class="nm">${def.name}</div><div class="tiny dim">Earns ${money(def.income * E.globalMult(s, now))}/s per level</div></div>
      <button class="btn red sm" data-act="buyRacket" data-id="${def.id}" data-live-buy="${def.id}" data-cost="${E.racketCost(def, 0, 1)}" data-n="1">Open<br>${money(E.racketCost(def, 0, 1))}</button></div>`;
  }
  return `<div class="card rk" data-rk="${def.id}">
    <div class="ic">${def.icon}<span class="lv">${rk.level}</span></div>
    <div class="grow">
      <div class="nm">${def.name}</div>
      <div class="tiny dim">${money(inc)}/s${next ? ` · x2 at lvl ${next}` : ''}</div>
      <div class="collect">
        ${auto ? `<span class="auto">● Lieutenant collecting</span>` : `
        <div class="bar"><i data-live-till="${def.id}"></i></div>
        <button class="tillbtn" data-act="collect" data-id="${def.id}" data-live-tillbtn="${def.id}">$0</button>`}
      </div>
    </div>
    <div class="col" style="align-items:stretch;gap:4px">
      <button class="btn sm red" data-act="buyRacket" data-id="${def.id}" data-n="${n}" data-live-buy="${def.id}" data-cost="${cost}">+${n} · ${money(cost)}</button>
      ${!rk.lieutenant ? `<button class="btn sm" data-act="hireLt" data-id="${def.id}" data-live-buy="lt${def.id}" data-cost="${E.lieutenantCost(def)}">Hire Lt · ${money(E.lieutenantCost(def))}</button>` : ''}
    </div>
  </div>`;
}

export function render(ctx) {
  const s = ctx.state, now = ctx.now();
  const g = GANGS[s.gang];
  const tier = M.repTier(s.rep);
  const obj = M.currentObjective(s);
  const ad = E.adBoostActive(s, now);
  const cred = E.credAvailable(s);
  const anyTill = Object.values(s.rackets).some((r) => r.till > 0);
  ctx.sub.objKey = obj ? `${obj.index}:${obj.done}` : 'none';
  ctx.sub.credKey = cred >= 1;
  return `
  <div class="title"><span class="h">Hideout</span><span class="sub">/ Empire</span></div>
  <div class="tagline">Run your rackets. Stack cash. Rule the streets.</div>
  <div class="hero"><div class="in">
    <div class="grow">
      <div class="tiny" style="color:${g.colour};font-family:var(--font);text-transform:uppercase">${g.name} · ${tier.name}</div>
      <div class="gname">Income</div>
      <div class="ips"><span data-live="ips">${money(E.totalIncome(s, now))}</span>/s</div>
      <div class="tiny dim">x${E.globalMult(s, now).toFixed(2)} multiplier${s.cred ? ` · ${s.cred} Street Cred` : ''}</div>
    </div>
    <button class="tapbtn" data-act="tap">Shake<br>down<small data-live="tapv">+${money(E.tapValue(s, now))}</small></button>
  </div></div>

  ${obj ? `<div class="card ${obj.done ? 'glow' : ''}"><div class="objective">
    <div class="tick">${obj.done ? '✔' : obj.index + 1}</div>
    <div class="grow"><div class="tiny red h">Boss's orders</div><div>${obj.text}</div><div class="tiny dim">Reward: ${rewardText(obj.reward)}</div></div>
    ${obj.done ? `<button class="btn red sm" data-act="claimObj">Claim</button>` : ''}
  </div></div>` : ''}

  <div class="row" style="margin:4px 0 2px">
    <button class="btn sm ${ad ? 'gold' : ''}" data-act="adBoost" style="flex:1">${ad ? `x2 income · <span data-live="adleft"></span>` : '▶ x2 income 30m (ad)'}</button>
    <button class="btn sm red" data-act="collectAll" style="flex:1" ${anyTill ? '' : ''}>Collect all</button>
  </div>

  <div class="sect">Rackets <span style="margin-left:auto"></span></div>
  <div class="row" style="margin-bottom:8px"><span class="tiny dim grow">Buy amount</span>
    <div class="seg">${[1, 10, 'max'].map((n) => `<button class="${buyN(ctx) === n ? 'on' : ''}" data-act="setBuyN" data-n="${n}">${n === 'max' ? 'Max' : 'x' + n}</button>`).join('')}</div>
  </div>
  ${RACKETS.map((d) => racketRow(ctx, d)).join('')}

  <div class="sect">Lay low</div>
  <div class="card">
    <div class="row"><div class="grow">
      <div class="h">Go to ground</div>
      <div class="tiny dim">Sell off every racket and disappear for a while. You keep your crew, gear, turf and Gold Teeth, and come back with permanent <b>Street Cred</b> (+2% income each).</div>
      <div class="small" style="margin-top:4px">Available now: <b class="gold">${cred}</b> Street Cred · lifetime earnings ${money(s.lifetime)}</div>
    </div>
    <button class="btn ${cred >= 1 ? 'gold' : ''} sm" data-act="layLow" ${cred >= 1 ? '' : 'disabled'}>Lay low</button></div>
  </div>`;
}

export function live(ctx, now) {
  const s = ctx.state;
  const obj = M.currentObjective(s);
  if ((obj ? `${obj.index}:${obj.done}` : 'none') !== ctx.sub.objKey || (E.credAvailable(s) >= 1) !== ctx.sub.credKey) { if (!document.querySelector('.overlay')) return ctx.render(); }
  const set = (sel, v) => { const n = document.querySelector(sel); if (n && n.textContent !== v) n.textContent = v; };
  set('[data-live="ips"]', money(E.totalIncome(s, now)));
  set('[data-live="tapv"]', '+' + money(E.tapValue(s, now)));
  const adl = document.querySelector('[data-live="adleft"]');
  if (adl) { const left = (s.boosts.adIncomeUntil - now) / 1000; if (left <= 0) ctx.render(); else adl.textContent = dur(left); }
  for (const def of RACKETS) {
    const rk = s.rackets[def.id];
    const bar = document.querySelector(`[data-live-till="${def.id}"]`);
    if (bar) {
      const cap = E.tillCap(s, def.id, now) || 1;
      bar.style.width = Math.min(100, (rk.till / cap) * 100) + '%';
      const b = document.querySelector(`[data-live-tillbtn="${def.id}"]`);
      b.textContent = money(rk.till);
      b.classList.toggle('full', rk.till >= cap * 0.999);
    }
  }
  document.querySelectorAll('[data-live-buy]').forEach((b) => b.classList.toggle('off', s.cash < +b.dataset.cost));
}

export const actions = {
  tap(ctx, el, e) {
    const v = E.tap(ctx.state, ctx.now());
    ctx.floaty('+' + money(v), e.clientX || el.getBoundingClientRect().left + 48, e.clientY || el.getBoundingClientRect().top);
    ctx.live();
  },
  collect(ctx, el, e) {
    const v = E.collect(ctx.state, el.dataset.id);
    if (v > 0) ctx.floaty('+' + money(v), e.clientX || 200, e.clientY || 300);
    ctx.live();
  },
  collectAll(ctx) {
    const v = E.collectAll(ctx.state);
    ctx.toast(v > 0 ? `Collected ${money(v)}` : 'Tills are empty');
    ctx.render();
  },
  buyRacket(ctx, el) {
    const n = +el.dataset.n || 1;
    const r = E.buyRacket(ctx.state, el.dataset.id, n);
    if (!r.ok) ctx.toast(r.reason === 'locked' ? 'Locked' : 'Not enough cash');
    ctx.render();
  },
  hireLt(ctx, el) {
    const r = E.hireLieutenant(ctx.state, el.dataset.id);
    ctx.toast(r.ok ? 'Lieutenant hired: this racket now runs itself, even offline' : 'Not enough cash');
    ctx.render();
  },
  setBuyN(ctx, el) { ctx.sub.buyN = el.dataset.n === 'max' ? 'max' : +el.dataset.n; ctx.render(); },
  claimObj(ctx) { const r = M.claimObjective(ctx.state); if (r.ok) ctx.toast('Reward: ' + rewardText(r.reward)); ctx.render(); },
  adBoost(ctx) {
    const r = E.watchIncomeAd(ctx.state, ctx.now());
    ctx.toast(r.ok ? 'Reward ad (mock) watched: income x2 for 30 min' : 'Daily ad limit reached (6)');
    ctx.render();
  },
  layLow(ctx) {
    const gain = E.credAvailable(ctx.state);
    const m = ctx.modal(`<div class="h" style="font-size:22px">Lay low?</div>
      <p class="dim">All rackets and cash reset. You keep crew, gear, turf and Gold Teeth.</p>
      <p>You gain <b class="gold">${gain} Street Cred</b>: income x${((1 + 0.02 * (ctx.state.cred + gain)) / (1 + 0.02 * ctx.state.cred)).toFixed(2)} forever.</p>
      <button class="btn gold block" data-act="confirmLayLow">Lay low</button>`, { center: true });
  },
  confirmLayLow(ctx) {
    const r = E.layLow(ctx.state);
    ctx.closeModal();
    if (r.ok) ctx.toast(`Back on the streets with +${r.gain} Street Cred`);
    ctx.render();
  },
};
