// Crew screen: roster + squad, member detail (gear, training), armoury, recruiting.
import { SPECIES, ROLES, RARITY, GEAR, RECRUIT, SQUAD_SIZE } from '../core/data.js';
import * as C from '../core/crew.js';
import { fmt, money, dur, esc } from './fmt.js';

const GEAR_ICON = { melee: '🔪', ranged: '🔫', armour: '🧥', gadget: '🧪' };
const gearIcon = (g) => !g ? '＋' : g.slot === 'weapon' ? (g.kind === 'melee' ? '🏏' : '🔫') : g.slot === 'armour' ? '🧥' : g.effect === 'heal' ? '💉' : g.effect === 'ap' ? '⚡' : g.effect === 'throw' ? '✴️' : '💨';
const QUOTES = ["They don't pay you to ask questions.", 'Rain washes the blood off. Mostly.', 'Every block has a price.', 'I never forget a face. Or a debt.', 'Loyalty. Fear. Respect.', 'The street remembers.'];
const tab = (ctx) => ctx.sub.crewTab || 'roster';

function memberCard(ctx, m) {
  const s = ctx.state, now = ctx.now();
  const t = s.training.find((x) => x.memberId === m.id);
  const insq = s.squad.includes(m.id);
  return `<div class="card member" data-act="openMember" data-id="${m.id}">
    <div class="portrait rar-${m.rarity}" style="background-image:url(${SPECIES[m.species].img})">${insq ? '<span class="insquad">SQUAD</span>' : ''}</div>
    <div class="grow">
      <div class="nm">${esc(m.name)}</div>
      <div class="tiny"><span class="t-${m.rarity}">${RARITY[m.rarity].name}</span> · ${SPECIES[m.species].name} ${ROLES[m.role].name}</div>
      ${t ? `<div class="tiny gold">Training to lvl ${m.level + 1}: <span data-live-train="${m.id}">${dur((t.endsAt - now) / 1000)}</span></div>` : `<div class="tiny dim">Power ${C.memberPower(m)} · ${m.wins} wins</div>`}
    </div>
    <div class="col" style="align-items:flex-end"><span class="h" style="font-size:20px">L${m.level}</span><span class="tiny faint">/${RARITY[m.rarity].maxLevel}</span></div>
  </div>`;
}

function roster(ctx) {
  const s = ctx.state;
  const sq = C.squadMembers(s);
  const slots = Array.from({ length: SQUAD_SIZE }, (_, i) => sq[i]);
  return `
  <div class="sect">Strike squad · power ${C.squadPower(s)}</div>
  <div class="squad">${slots.map((m) => m ? `<div class="slot rar-${m.rarity}" data-act="openMember" data-id="${m.id}" style="border-style:solid;background-image:url(${SPECIES[m.species].img})"><span class="lvl">${ROLES[m.role].icon} L${m.level}</span></div>` : `<div class="slot" style="display:grid;place-items:center;color:var(--faint)">empty</div>`).join('')}</div>
  <div class="tiny dim" style="margin:6px 2px">Tap a member to equip, train or swap them in. Up to ${SQUAD_SIZE} fight in battles. Training benches: ${s.training.length}/${C.benches(s, ctx.now())}</div>
  <div class="sect">Roster ${s.crew.length}/${C.rosterCap(s)}</div>
  ${[...s.crew].sort((a, b) => C.memberPower(b) - C.memberPower(a)).map((m) => memberCard(ctx, m)).join('')}`;
}

function armoury(ctx) {
  const s = ctx.state;
  const inv = Object.entries(s.inventory).filter(([, n]) => n > 0);
  const rows = Object.entries(GEAR).filter(([, g]) => g.price > 0);
  return `
  <div class="sect">Your stash</div>
  ${inv.length ? `<div class="card"><div class="row" style="flex-wrap:wrap;gap:6px">${inv.map(([id, n]) => `<span class="pill t-${GEAR[id].rarity}">${gearIcon(GEAR[id])} ${GEAR[id].name} x${n}</span>`).join('')}</div><div class="tiny dim" style="margin-top:6px">Equip gear from a crew member's page.</div></div>` : '<div class="card tiny dim">Nothing spare. Buy gear below or win it in fights.</div>'}
  <div class="sect">Black market dealer</div>
  ${rows.map(([id, g]) => `<div class="card gear">
    <div class="gi">${gearIcon(g)}</div>
    <div><div class="h t-${g.rarity}">${g.name}</div>
      <div class="tiny dim">${g.slot === 'weapon' ? `${g.kind === 'melee' ? 'Melee (Enforcers)' : 'Ranged'} · DMG ${g.dmg} · range ${g.range}${g.acc ? ` · acc ${g.acc > 0 ? '+' : ''}${g.acc}` : ''}` : g.slot === 'armour' ? `Armour · DEF ${g.def}` : `Gadget · ${g.desc}`}</div></div>
    <button class="btn sm red" data-act="buyGear" data-id="${id}" data-live-buy="g${id}" data-cost="${g.price}">${money(g.price)}</button>
  </div>`).join('')}`;
}

function recruitTab(ctx) {
  const s = ctx.state;
  const odds = (o) => o.map(([r, w]) => `<span class="t-${r}">${RARITY[r].name} ${w}%</span>`).join(' · ');
  const cost = C.streetRecruitCost(s);
  return `
  <div class="sect">Recruit</div>
  <div class="card">
    <div class="row"><div class="portrait" style="background-image:url(assets/rat.jpg)"></div>
      <div class="grow"><div class="h">${RECRUIT.street.name}</div><div class="tiny dim">Someone hungry from the estates. Price rises each time.</div>
      <div class="odds">${odds(RECRUIT.street.odds)}</div></div></div>
    <button class="btn red block" style="margin-top:8px" data-act="recruit" data-type="street" data-live-buy="rs" data-cost="${cost}">Recruit · ${money(cost)}</button>
  </div>
  <div class="card glow">
    <div class="row"><div class="portrait rar-legendary" style="background-image:url(assets/fox.jpg)"></div>
      <div class="grow"><div class="h gold">${RECRUIT.premium.name}</div><div class="tiny dim">Proven talent. Guaranteed Rare or better.</div>
      <div class="odds">${odds(RECRUIT.premium.odds)}</div>
      <div class="tiny" style="margin-top:2px">Legendary guaranteed within <b>${RECRUIT.premium.pity - s.pity}</b> more recruits (pity counter, shown up front).</div></div></div>
    <button class="btn gold block" style="margin-top:8px" data-act="recruit" data-type="premium">${s.tickets > 0 ? `Use ticket (${s.tickets})` : `Recruit · 🦷 ${RECRUIT.premium.cost}`}</button>
  </div>
  <div class="tiny faint" style="padding:0 2px">Odds are published before every recruit, as UK industry loot box principles expect. Under-18 accounts would need parental consent to spend.</div>`;
}

export function render(ctx) {
  const t = tab(ctx);
  return `
  <div class="title"><span class="h">Crew</span><span class="sub">/ ${t === 'roster' ? 'Roster' : t === 'armoury' ? 'Armoury' : 'Recruit'}</span></div>
  <div class="tagline">Manage your soldiers. Arm them. Rule the streets.</div>
  <div class="tabs">${['roster', 'armoury', 'recruit'].map((x) => `<button class="${t === x ? 'on' : ''}" data-act="crewTab" data-t="${x}">${x}</button>`).join('')}</div>
  ${t === 'roster' ? roster(ctx) : t === 'armoury' ? armoury(ctx) : recruitTab(ctx)}`;
}

export function live(ctx, now) {
  const s = ctx.state;
  for (const t of s.training) {
    const el = document.querySelectorAll(`[data-live-train="${t.memberId}"]`);
    el.forEach((n) => (n.textContent = dur((t.endsAt - now) / 1000)));
    document.querySelectorAll(`[data-live-skip="${t.memberId}"]`).forEach((n) => { const c = C.skipCost(t, now); n.textContent = c ? `Finish now · 🦷 ${c}` : 'Finish (free)'; });
  }
  document.querySelectorAll('[data-live-buy]').forEach((b) => b.classList.toggle('off', s.cash < +b.dataset.cost));
}

// ---------------------------------------------------------------- member detail sheet
function statBar(label, v, max = 160) {
  return `<div><div class="k">${label}</div><div class="v">${v}</div><div class="bar"><i style="width:${Math.min(100, (v / max) * 100)}%"></i></div></div>`;
}

export function memberSheet(ctx, id) {
  const s = ctx.state, now = ctx.now();
  const m = s.crew.find((x) => x.id === id);
  if (!m) return '';
  const st = C.memberStats(m);
  const sp = SPECIES[m.species];
  const t = s.training.find((x) => x.memberId === id);
  const cost = C.levelUpCost(m);
  const max = m.level >= RARITY[m.rarity].maxLevel;
  const quote = QUOTES[(m.name.length + m.level) % QUOTES.length];
  const slot = (key, label) => {
    const g = m.gear[key] ? GEAR[m.gear[key]] : null;
    const desc = !g ? 'Empty slot' : key === 'weapon' ? `${g.kind === 'melee' ? 'Melee' : 'Ranged'} · DMG ${g.dmg} · range ${g.range}` : key === 'armour' ? `DEF ${g.def}` : g.desc;
    return `<div class="card gear" data-act="pickGear" data-id="${m.id}" data-slot="${key}">
      <div class="gi">${gearIcon(g)}</div>
      <div><div class="tiny red h">${label}</div><div class="h">${g ? g.name : '—'}</div><div class="tiny dim">${desc}</div></div>
      <span class="btn sm ghost">Change</span></div>`;
  };
  return `
  <div class="detail-hero">
    <div class="big rar-${m.rarity}" style="background-image:url(${sp.img})"></div>
    <div class="namebox">
      <div class="n">${esc(m.name)}</div>
      <div class="r">${ROLES[m.role].name}</div>
      <div class="tiny t-${m.rarity}">${RARITY[m.rarity].name} ${sp.name}</div>
      <div class="h">LVL ${m.level}<span class="faint">/${RARITY[m.rarity].maxLevel}</span></div>
      <div class="bar"><i style="width:${(m.level / RARITY[m.rarity].maxLevel) * 100}%"></i></div>
      <div class="quote">“${quote}”</div>
    </div>
  </div>
  <div class="card" style="margin-top:8px"><div class="tiny red h">Trait · ${sp.traitName}</div><div class="small">${sp.traitDesc}</div><div class="tiny dim" style="margin-top:4px">${ROLES[m.role].desc}</div></div>
  ${slot('weapon', 'Weapon')}${slot('armour', 'Armour')}${slot('gadget', 'Gadget')}
  <div class="card"><div class="tiny red h" style="margin-bottom:6px">Crew member stats</div>
    <div class="stat3">${statBar('Muscle', st.muscle)}${statBar('Aim', st.aim)}${statBar('Nerve', st.nerve)}</div>
    <div class="tiny dim" style="margin-top:6px">HP ${st.hp} · DEF ${st.def} · Crit ${st.crit}% · AP ${st.ap} · Power ${C.memberPower(m)}</div>
  </div>
  ${t ? `<div class="card glow"><div class="h gold">Training to level ${m.level + 1}</div><div class="small">Ready in <b data-live-train="${m.id}">${dur((t.endsAt - now) / 1000)}</b></div>
      <button class="btn gold block" style="margin-top:6px" data-act="skipTrain" data-id="${m.id}" data-live-skip="${m.id}">Finish now</button></div>`
    : max ? `<div class="card tiny dim">Max level for ${RARITY[m.rarity].name}. Higher rarities level further.</div>`
    : `<div class="card"><div class="row"><div class="grow"><div class="h">Upgrade ${esc(m.name)}</div><div class="tiny dim">Cost: ${money(cost.cash)} + 🐾 ${cost.influence} · takes ${dur(C.trainingSeconds(m))} on a bench</div></div>
      <button class="btn red" data-act="train" data-id="${m.id}">Upgrade</button></div></div>`}
  <div class="row" style="margin-top:4px">
    <button class="btn block" data-act="toggleSquad" data-id="${m.id}">${s.squad.includes(m.id) ? 'Bench from squad' : 'Add to squad'}</button>
    <button class="btn ghost" data-act="dismiss" data-id="${m.id}">Dismiss</button>
  </div>`;
}

function openMember(ctx, id) { ctx.sub.openMember = id; ctx.modal(memberSheet(ctx, id), { onClose: () => { ctx.sub.openMember = null; ctx.render(); } }); }
function refreshMember(ctx) { const el = document.querySelector('.overlay .sheet'); if (el && ctx.sub.openMember) el.innerHTML = '<button class="x" data-act="closeModal">✕</button>' + memberSheet(ctx, ctx.sub.openMember); }

export const actions = {
  crewTab(ctx, el) { ctx.sub.crewTab = el.dataset.t; ctx.render(); },
  openMember(ctx, el) { openMember(ctx, el.dataset.id); },
  train(ctx, el) {
    const r = C.startTraining(ctx.state, el.dataset.id, ctx.now());
    const msg = { bench: 'All training benches busy. A second bench is in the Market.', cash: 'Not enough cash', influence: 'Not enough influence: win fights and hold turf', max: 'Max level' };
    ctx.toast(r.ok ? 'Training started' : msg[r.reason] || 'Cannot train');
    refreshMember(ctx);
  },
  skipTrain(ctx, el) {
    const r = C.skipTraining(ctx.state, el.dataset.id, ctx.now());
    ctx.toast(r.ok ? `Done${r.cost ? ` for 🦷 ${r.cost}` : ''}: level up!` : 'Not enough Gold Teeth');
    refreshMember(ctx); ctx.live();
  },
  toggleSquad(ctx, el) {
    const r = C.toggleSquad(ctx.state, el.dataset.id);
    if (!r.ok) ctx.toast(r.reason === 'full' ? 'Squad is full (4). Bench someone first.' : 'Busy training');
    refreshMember(ctx);
  },
  dismiss(ctx, el) {
    const r = C.dismiss(ctx.state, el.dataset.id);
    if (r.ok) { ctx.closeModal(true); ctx.sub.openMember = null; ctx.toast(`Dismissed. +🐾 ${r.refund}`); ctx.render(); } else ctx.toast('You need at least one crew member');
  },
  pickGear(ctx, el) {
    const s = ctx.state; const m = s.crew.find((x) => x.id === el.dataset.id); const slot = el.dataset.slot;
    const opts = Object.entries(GEAR).filter(([gid, g]) => g.slot === slot && C.canEquip(m, gid) && (g.price === 0 || s.inventory[gid] > 0));
    const html = `<div class="h" style="font-size:20px">Choose ${slot}</div><div class="tiny dim" style="margin-bottom:8px">From your stash. Buy more in the Armoury.</div>
      ${opts.map(([gid, g]) => `<div class="card gear"><div class="gi">${gearIcon(g)}</div><div><div class="h t-${g.rarity}">${g.name}${m.gear[slot] === gid ? ' <span class="pill">equipped</span>' : ''}</div>
        <div class="tiny dim">${slot === 'weapon' ? `DMG ${g.dmg} · range ${g.range}` : slot === 'armour' ? `DEF ${g.def}` : g.desc}${g.price ? ` · x${s.inventory[gid] || 0} spare` : ' · standard issue'}</div></div>
        ${m.gear[slot] === gid ? '' : `<button class="btn sm red" data-act="equip" data-id="${m.id}" data-g="${gid}">Equip</button>`}</div>`).join('') || '<div class="dim">Nothing usable in your stash.</div>'}
      <button class="btn block" data-act="openMemberBack" data-id="${m.id}">Back</button>`;
    ctx.modal(html, { onClose: () => openMember(ctx, m.id) });
  },
  equip(ctx, el) {
    const r = C.equip(ctx.state, el.dataset.id, el.dataset.g);
    ctx.toast(r.ok ? 'Equipped' : 'Cannot equip');
    openMember(ctx, el.dataset.id);
  },
  openMemberBack(ctx, el) { openMember(ctx, el.dataset.id); },
  buyGear(ctx, el) { const r = C.buyGear(ctx.state, el.dataset.id); ctx.toast(r.ok ? `Bought ${GEAR[el.dataset.id].name}` : 'Not enough cash'); ctx.render(); },
  recruit(ctx, el) {
    const r = C.recruit(ctx.state, el.dataset.type);
    if (!r.ok) { ctx.toast({ roster: 'Roster full. Dismiss someone first.', cash: 'Not enough cash', teeth: 'Not enough Gold Teeth' }[r.reason]); return; }
    const m = r.member;
    ctx.render();
    ctx.modal(`<div class="result win"><div class="h dim">New recruit</div>
      <div class="portrait rar-${m.rarity}" style="width:160px;height:160px;margin:10px auto;background-image:url(${SPECIES[m.species].img})"></div>
      <div class="big t-${m.rarity}" style="font-size:34px">${esc(m.name)}</div>
      <div class="h"><span class="t-${m.rarity}">${RARITY[m.rarity].name}</span> ${SPECIES[m.species].name} ${ROLES[m.role].name}</div>
      <div class="tiny dim">${SPECIES[m.species].traitName}: ${SPECIES[m.species].traitDesc}</div>
      <button class="btn red block" style="margin-top:12px" data-act="closeModal">Welcome to the family</button></div>`, { center: true });
  },
};
