// v0.20 guided intro (sample). Told through Rook. A comic storyboard (painted panels, slow pans, captions in
// Rook's voice), then a guided Mission 1 (the docks job for the Thaw, paid in Ice), one base build, a quick
// scrap-bench craft, Mission 2 (Helix strikes back) and then the hand-holding fades. The in-battle teaching
// reuses the v0.19.1 tutorial-step system (js/ui/tutor.js); the intro only adds a story line per fight.
//
// State: s.intro = { step, beat?, b0?, crafted?, replay? }. Old saves have no s.intro and never see it.
// Steps: story -> m1 -> base -> craft -> m2 -> done. ?intro=1 replays it on any save.
import * as T from '../core/tactics.js';
import { opMap } from '../core/ops.js';
import { ITEMS, QUALITY, addItem, equipItem } from '../core/items.js';
import { itemImg } from './character.js';
import { esc, ico } from './fmt.js';
import { forget } from './tutor.js';
import * as Audio from './audio.js';

export const STEPS = ['story', 'm1', 'base', 'craft', 'm2', 'done'];
// Battle teaching steps are re-armed when the intro starts, so the guided fight always teaches.
const TEACH = ['turn', 'move', 'cover', 'special', 'target', 'odds', 'end', 'look'];

// kb = Ken Burns pan: [scale, x%, y%] from -> to. cap: 'tl' | 'br' | 'bl' | 'tr' where the caption boxes sit.
export const PANELS = [
  { img: 'assets/intro/1-spark.webp', tag: 'Before us', cap: 'tl', kb: [[1.18, 4, 2], [1.04, -2, 0]],
    lines: ['Before us, there were humans.', 'They spliced themselves into us. Cheap muscle. Spare parts.'] },
  { img: 'assets/intro/2-fall.webp', tag: 'The fall', cap: 'tl', kb: [[1.04, 0, -2], [1.2, -3, 2]],
    lines: ['Then they burned their world down.', 'Their virus outlived them. Now every one of us is part human.'] },
  { img: 'assets/intro/3-pact.webp', tag: 'The Pact', cap: 'bl', kb: [[1.2, 5, -3], [1.05, -3, 1]],
    lines: ['We stood up in their ruins. Fought two wars over the scraps.', 'Then we signed the Pact and built Fang City.'] },
  { img: 'assets/intro/4-slip.webp', tag: 'Thirty years on', cap: 'br', kb: [[1.05, 3, 0], [1.22, 6, 3]],
    lines: ['Now the human in us is fading. Folk go wild.', 'Doctors call it the Slip.'] },
  { img: 'assets/intro/5-helix.webp', tag: 'Helix', cap: 'br', kb: [[1.22, 8, 3], [1.06, 0, 0]],
    lines: ['Only Ice holds it off. Helix makes every vial.', 'Augustus Vale owns Helix. Vale sets the price.'] },
  { img: 'assets/intro/6-hire.webp', tag: 'The Thaw', cap: 'br', kb: [[1.05, -2, 0], [1.2, 6, 2]],
    lines: ['Bracken Hale runs the rebels. He wants Vale’s grip broken.', 'Tonight his Thaw hits a Helix shipment at the docks. They need muscle.'] },
  { img: 'assets/intro/7-rook.webp', tag: 'Rook', cap: 'bl', kb: [[1.04, -3, 0], [1.24, -8, 2]],
    lines: ['Name’s Rook. I work for whoever pays in Ice.', 'Lately I need it more than I let on.'] },
];
// One-panel story beats between the guided steps.
const BEATS = {
  paid: { img: 'assets/intro/6-hire.webp', tag: 'After the job', cap: 'tr', kb: [[1.2, 6, 2], [1.06, 0, 0]], btn: 'Back to the hideout',
    lines: ['Hale paid in Ice. Two vials. A month of being me.', 'Helix will want it back. Time to dig in.'] },
  raid: { img: 'assets/intro/5-helix.webp', tag: 'Helix tower', cap: 'br', kb: [[1.06, 0, 0], [1.24, -4, 2]], btn: 'Defend the hideout',
    lines: ['Vale doesn’t lose shipments. He sends people.', 'They found my door.'] },
  end: { img: 'assets/intro/7-rook.webp', tag: 'Fang City', cap: 'bl', kb: [[1.24, -8, 2], [1.04, 0, 0]], btn: 'Run the hideout',
    lines: ['Helix will be back. So will I.', 'From here, you call the shots.'] },
};

export const active = (s) => !!(s && s.intro && s.intro.step && s.intro.step !== 'done');
export const step = (s) => (s && s.intro && s.intro.step) || 'done';
const builds = (s) => (s.stats.builds || 0) + (s.stats.upgrades || 0);

export function begin(s, replay = false) {
  s.intro = { step: 'story', crafted: 0, replay: replay ? 1 : 0 };
  forget(TEACH);
}
function goStep(s, id) {
  s.intro.step = id;
  if (id === 'base') s.intro.b0 = builds(s);
}

// Called on every render: moves the intro on from plain game state (so it survives reloads).
export function sync(ctx) {
  const s = ctx.state, it = s && s.intro;
  if (!active(s) || s.tactics) return;
  if (it.step === 'm1' && s.heroes.tutorialDone && !it.replay) { goStep(s, 'base'); it.beat ||= 'paid'; }
  if (it.step === 'base' && builds(s) > (it.b0 || 0)) { goStep(s, 'craft'); ctx.toast('Build started. Builders work while you play.'); }
}
// A fight started by the intro just ended (js/ui/tactics.js finish()).
export function onFightEnd(ctx, b, res) {
  const s = ctx.state;
  if (!b || !b.intro || !s.intro || !res || !res.win) return;
  if (b.intro === 1 && s.intro.step === 'm1') { goStep(s, 'base'); s.intro.beat = 'paid'; }
  if (b.intro === 2 && s.intro.step === 'm2') { goStep(s, 'done'); s.intro.beat = 'end'; }
}
// After the base renders: play a waiting story beat (never over a modal or a fight).
export function afterRender(ctx) {
  const s = ctx.state, it = s && s.intro;
  if (!it) return;
  if (it.step === 'story') { if (!document.querySelector('.introsb')) storyboard(ctx, PANELS, { onDone: () => toMission1(ctx), skippable: true }); return; }
  if (!it.beat || ctx.tab !== 'base' || document.querySelector('.overlay, .introsb')) return;
  const id = it.beat, beat = BEATS[id];
  storyboard(ctx, [beat], { btn: beat.btn, onDone: () => {
    if (s.intro.beat === id) delete s.intro.beat;
    ctx.save();
    if (id === 'raid') startM2(ctx); else ctx.render();
  } });
}

// ---------------------------------------------------------------- storyboard overlay
export function storyboard(ctx, panels, { onDone, btn = 'Take the job', skippable = false } = {}) {
  document.querySelector('.introsb')?.remove();
  const el = document.createElement('div');
  el.className = 'introsb';
  el.setAttribute('role', 'dialog');
  let i = 0, shown = 0, timers = [];
  const clear = () => { timers.forEach(clearTimeout); timers = []; };
  const last = () => i === panels.length - 1;
  const caps = () => [...el.querySelectorAll('.sbcap')];
  const reveal = (n) => { caps().forEach((c, k) => c.classList.toggle('on', k < n)); shown = n; el.querySelector('.sbnext').classList.toggle('on', n >= panels[i].lines.length); };
  const draw = () => {
    clear();
    const p = panels[i], [a, z] = p.kb;
    const next = panels[i + 1];
    el.innerHTML = `
      <div class="sbpanel">
        <div class="sbimg" style="--s0:${a[0]};--x0:${a[1]}%;--y0:${a[2]}%;--s1:${z[0]};--x1:${z[1]}%;--y1:${z[2]}%;background-image:url('${p.img}')"></div>
        <div class="sbtag">${esc(p.tag)}</div>
        <div class="sbcaps ${p.cap}">${p.lines.map((l) => `<div class="sbcap">${esc(l)}</div>`).join('')}</div>
      </div>
      ${skippable ? '<button class="sbskip" data-sb="skip">Skip ›</button>' : ''}
      ${panels.length > 1 ? `<div class="sbdots">${panels.map((_, k) => `<i class="${k === i ? 'on' : k < i ? 'done' : ''}"></i>`).join('')}</div>` : ''}
      <button class="sbnext ${last() ? 'go' : ''}" data-sb="next">${last() ? esc(btn) + ' ›' : 'Tap to continue ›'}</button>
      ${next ? `<link rel="preload" as="image" href="${next.img}">` : ''}`;
    shown = 0;
    reveal(0);
    timers.push(setTimeout(() => reveal(1), ctx.fast ? 50 : 500));
    for (let k = 2; k <= p.lines.length; k++) timers.push(setTimeout(() => reveal(k), ctx.fast ? 80 : 500 + (k - 1) * 1700));
  };
  const finish = () => { clear(); el.remove(); onDone && onDone(); };
  el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-sb]');
    const act = t && t.dataset.sb;
    if (act === 'skip') return skipMenu(ctx, el, finish);
    if (act === 'skipStory') return finish();
    if (act === 'skipAll') { clear(); el.remove(); skipIntro(ctx); return; }
    if (act === 'stay') { el.querySelector('.sbmenu')?.remove(); return; }
    if (el.querySelector('.sbmenu')) return;
    if (shown < panels[i].lines.length) { clear(); reveal(panels[i].lines.length); return; }
    Audio.play('tap');
    if (last()) return finish();
    i++; draw();
  });
  document.getElementById('app').appendChild(el);
  draw();
  return el;
}
function skipMenu(ctx, el, finish) {
  if (el.querySelector('.sbmenu')) return;
  const m = document.createElement('div');
  m.className = 'sbmenu';
  m.innerHTML = `<div class="h">Skip?</div>
    <button class="btn red block" data-sb="skipStory">Skip the story · play the docks job</button>
    <button class="btn block" data-sb="skipAll">Skip the whole intro</button>
    <button class="btn ghost block" data-sb="stay">Keep watching</button>`;
  el.appendChild(m);
}

// ---------------------------------------------------------------- the guided beats
export function toMission1(ctx) {
  const s = ctx.state;
  if (!s.intro) begin(s);
  goStep(s, 'm1');
  ctx.save();
  startM1(ctx);
}
export function startM1(ctx) {
  const s = ctx.state;
  const b = T.startTutorial(s, s.rng);
  b.intro = 1; b.label = 'Docks job';
  s.tactics = b; ctx.sub.tactics = null; ctx.sub.afterBattle = 'base';
  ctx.go('tactics');
}
export function startM2(ctx) {
  const s = ctx.state;
  const map = opMap({ map: 'back_streets' }, 1, 2);
  map.name = 'Outside the hideout';
  const b = T.startBattle({
    map, player: ['rook'], enemy: ['knack', 'hook'], seed: (s.rng >>> 0) || 1,
    label: 'Helix strikes back', kind: 'op', pvp: false, reward: { cash: 250, influence: 0 },
    loadout: { recs: { rook: T.packFromState(s, 'rook') }, ammo: { rook: 6 }, medkits: { rook: 1 } },
    enemyRecs: [{ lv: 1 }, { lv: 1 }],
  });
  b.intro = 2; b.freeAmmo = 1;
  s.tactics = b; ctx.sub.tactics = null; ctx.sub.afterBattle = 'base';
  ctx.go('tactics');
}
export function skipIntro(ctx) {
  const s = ctx.state;
  if (!s.intro) return;
  s.intro.step = 'done'; delete s.intro.beat;
  ctx.closeModal && ctx.closeModal(true);
  ctx.save(); ctx.go('base');
  ctx.toast('Intro skipped. Tap NEXT OP when you are ready.');
}

// In-battle story lines: one short line at the start of each intro fight, before the teaching steps.
// Shown through the same hint toast (tap to dismiss; gone once Rook moves).
export const INTRO_BATTLE_STEPS = [
  { id: 'intro-m1', once: false,
    when: ({ b, a }) => b.intro === 1 && b.turn === 1 && !a.moved && !a.acted,
    done: ({ u, a }) => !!(u.preview || a.moved || a.acted),
    html: () => '<b>Docks, midnight.</b> The Helix shipment’s in that container. Hook’s guarding it. Helix hired him for the night.' },
  { id: 'intro-m2', once: false,
    when: ({ b, a }) => b.intro === 2 && b.turn === 1 && !a.moved && !a.acted,
    done: ({ u, a }) => !!(u.preview || a.moved || a.acted),
    html: () => '<b>Helix found the hideout.</b> Two hired guns. You know the drill now: cover, close in, hit hard.' },
];

// The step card on the hideout (replaces Boss's orders while the intro runs).
export function baseCard(ctx) {
  const s = ctx.state;
  if (!active(s) || s.intro.step === 'story') return '';
  const it = s.intro, place = ctx.sub.base && ctx.sub.base.place;
  const n = { m1: 1, base: 2, craft: 3, m2: 4 }[it.step] || 1;
  let line = '', cta = '';
  if (it.step === 'm1') { line = 'Hale pays in Ice. The Helix shipment is sitting at the docks.'; cta = '<button class="btn sm red" data-act="introM1">Hit the docks</button>'; }
  else if (it.step === 'base') {
    line = place ? 'Drag it to a clear spot, then tap <b>✔</b> to build.' : 'Ice doesn’t pay rent. Cash does. Build a <b>Knock-off Stall</b>.';
    cta = place ? '' : '<button class="btn sm red" data-act="openBuild">Build</button>';
  } else if (it.step === 'craft') { line = 'The crate had more than Ice: scrap and tools. Make Rook something useful.'; cta = '<button class="btn sm red" data-act="introBench">Open the bench</button>'; }
  else if (it.step === 'm2') { line = 'Helix is at the door.'; cta = '<button class="btn sm red" data-act="introM2">Defend</button>'; }
  return `<div class="introcard"><img src="assets/heroes/rook-64.webp" alt="" decoding="async">
    <div class="grow"><div class="tiny h"><span class="red">Rook</span> · <span class="dim">Intro ${n}/4</span></div><div class="small">${line}</div></div>
    <div class="col">${cta}<button class="linkbtn tiny" data-act="introSkip">Skip intro</button></div></div>`;
}
// Hideout re-renders the card when this changes (step, or placing a building).
export const key = (ctx) => `i:${step(ctx.state)}:${ctx.sub.base && ctx.sub.base.place ? 1 : 0}`;
// Gentle glow on the hideout button the current step needs.
export const glow = (s, what) => (active(s) && ((what === 'build' && s.intro.step === 'base'))) ? ' introglow' : '';

// ---------------------------------------------------------------- scrap bench (a light Factory preview)
export const BENCH = ['leather', 'workboots', 'bat'];
export const BENCH_PARTS = 3, BENCH_GIFT = 6;
function benchHtml(ctx) {
  const s = ctx.state, it = s.intro;
  const done = it.made || [];
  const left = Math.max(0, Math.floor(s.parts || 0));
  const rows = BENCH.map((id) => {
    const item = ITEMS[id], q = QUALITY[item.q];
    const made = done.includes(id);
    const worn = Object.values(s.heroes.owned.rook.equip || {}).includes(id);
    const bits = [item.hp ? `+${item.hp} HP` : '', item.dodge ? `+${item.dodge} dodge` : '', item.mdmg ? `+${item.mdmg} melee` : '', item.wpn ? `${item.wpn.dmg[0]}–${item.wpn.dmg[1]} dmg` : ''].filter(Boolean).join(' · ');
    const btn = made ? (worn ? '<span class="tiny gold">On Rook ✔</span>' : `<button class="btn sm gold" data-act="introEquip" data-id="${id}">Put it on Rook</button>`)
      : `<button class="btn sm red" data-act="introCraft" data-id="${id}" ${left < BENCH_PARTS || done.length >= 2 ? 'disabled' : ''}>Craft · ${ico('parts')} ${BENCH_PARTS}</button>`;
    return `<div class="benchrow ${made ? 'made' : ''}"><span class="iframe q-${item.q}">${itemImg(id)}</span>
      <div class="grow"><b style="color:${q.col}">${esc(item.name)}</b><div class="tiny dim">${esc(q.name)} · ${bits}</div></div>${btn}</div>`;
  }).join('');
  return `<div class="facp introbenchp"><div class="fachead"><img loading="lazy" decoding="async" src="assets/base/factory.webp" alt=""><div><div class="h" style="font-size:22px">Scrap bench</div>
      <div class="tiny dim">Scrap from the Helix crate: ${ico('parts')} <b>${left}</b> parts · craft up to 2</div></div></div>
    <div class="benchlist">${rows}</div>
    <div class="row" style="margin-top:8px;align-items:center"><div class="tiny faint grow">Parts + a blueprint make gear. The full Factory opens at player Lv 7.</div>
    <button class="btn ${done.length ? 'red' : ''}" data-act="introBenchDone" ${done.length ? '' : 'disabled'}>${done.length ? 'That’ll do' : 'Craft one first'}</button></div></div>`;
}
export function openBench(ctx) {
  const s = ctx.state;
  if (!s.intro.gift) { s.parts = (s.parts || 0) + BENCH_GIFT; s.intro.gift = 1; ctx.save(); }
  ctx.modal(benchHtml(ctx), { cls: 'facmodal introbench' });
}
const refreshBench = (ctx) => { const el = document.querySelector('.introbench .sheet'); if (el) el.innerHTML = '<button class="x" data-act="closeModal">✕</button>' + benchHtml(ctx); };

export const actions = {
  introM1: (ctx) => startM1(ctx),
  introM2: (ctx) => startM2(ctx),
  introBench: (ctx) => openBench(ctx),
  introSkip: (ctx) => ctx.modal(`<div class="h" style="font-size:20px">Skip the intro?</div>
      <p class="small">You keep everything you have earned. Boss's orders take over from here.</p>
      <div class="row"><button class="btn block" data-act="closeModal">Keep going</button><button class="btn red block" data-act="introSkipYes">Skip it</button></div>`, { center: true }),
  introSkipYes: (ctx) => skipIntro(ctx),
  introCraft: (ctx, el) => {
    const s = ctx.state, it = s.intro, id = el.dataset.id;
    it.made ||= [];
    if (!BENCH.includes(id) || it.made.includes(id) || it.made.length >= 2) return;
    if ((s.parts || 0) < BENCH_PARTS) return ctx.toast(`Need ${BENCH_PARTS} parts`);
    s.parts -= BENCH_PARTS; addItem(s, id, 1); it.made.push(id); it.crafted = it.made.length;
    s.stats.crafted = (s.stats.crafted || 0) + 1;
    Audio.play('collect'); ctx.toast(`${ITEMS[id].name} crafted`);
    ctx.save(); refreshBench(ctx);
  },
  introEquip: (ctx, el) => {
    const r = equipItem(ctx.state, 'rook', el.dataset.id);
    if (!r.ok) return ctx.toast(r.reason);
    ctx.toast(`${ITEMS[el.dataset.id].name} on Rook`); ctx.save(); refreshBench(ctx);
  },
  introBenchDone: (ctx) => {
    const s = ctx.state;
    if (!(s.intro.made || []).length) return;
    goStep(s, 'm2'); s.intro.beat = 'raid';
    ctx.closeModal(true); ctx.save(); ctx.render();
  },
};
