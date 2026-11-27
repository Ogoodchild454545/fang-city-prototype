// v0.20 guided intro (sample). Told through Rook. A comic storyboard (painted panels, slow pans, captions in
// Rook's voice), then a guided Mission 1 (the docks job for the rebels, paid in Ice), one base build, a quick
// scrap-bench craft, Mission 2 (Helix strikes back) and then the hand-holding fades. The in-battle teaching
// reuses the v0.19.1 tutorial-step system (js/ui/tutor.js); the intro only adds a story line per fight.
//
// State: s.intro = { step, beat?, b0?, crafted?, replay? }. Old saves have no s.intro and never see it.
// Steps: story -> m1 -> base -> craft -> m2 -> done. ?intro=1 replays it on any save.
import * as T from '../core/tactics.js';
import { opMap } from '../core/ops.js';
import { ITEMS, QUALITY, addItem, statsFor, targetSlot, SLOT_BY_ID, defaultEquip } from '../core/items.js';
import { itemImg } from './character.js';
import { esc, ico } from './fmt.js';
import { forget } from './tutor.js';
import * as Audio from './audio.js';

export const STEPS = ['story', 'm1', 'base', 'craft', 'equip', 'm2', 'tour', 'done'];
// Battle teaching steps are re-armed when the intro starts, so the guided fight always teaches.
const TEACH = ['tour', 'turn', 'move', 'cover', 'special', 'target', 'odds', 'end', 'look',
  // v0.20.2 Mission 2 notes (js/ui/tactics.js ADV_STEPS)
  'adv-order', 'adv-overwatch', 'adv-cover', 'adv-threat', 'adv-flank', 'adv-status', 'adv-barrel', 'adv-hunker', 'adv-cooldown', 'adv-heal', 'adv-ammo'];

// kb = Ken Burns pan: [scale, x%, y%] from -> to. cap: 'tl' | 'br' | 'bl' | 'tr' where the caption boxes sit.
export const PANELS = [
  { img: 'assets/intro/1-spark.webp', tag: 'Before us', cap: 'tl', kb: [[1.18, 4, 2], [1.04, -2, 0]],
    lines: ['Humans spliced their genes into pigs to grow hearts and kidneys for transplants.', 'Apes and dogs were made smarter and stronger: cheap muscle for the worst jobs.'] },
  { img: 'assets/intro/2c-nuke.webp', tag: 'World War Three', cap: 'tl', kb: [[1.05, 0, 2], [1.2, -2, 4]],
    lines: ['Before they could finish the work, World War Three broke out.', 'The nuclear war wiped out human life as they knew it.'] },
  { img: 'assets/intro/2-fall.webp', tag: 'After the bombs', cap: 'tl', kb: [[1.04, 0, -2], [1.2, -3, 2]],
    lines: ['Their gene drive, a virus built to spread the change, got loose in the fallout.', 'It reached every species. Now every animal is part human, mind and body.'] },
  { img: 'assets/intro/3-pact.webp', tag: 'The Pact', cap: 'bl', kb: [[1.2, 5, -3], [1.05, -3, 1]],
    lines: ['We stood up in their ruins. Fought two wars of our own over the scraps.', 'Then we signed the Pact and built Fang City.'] },
  { img: 'assets/intro/4-slip.webp', tag: 'Thirty years on', cap: 'br', kb: [[1.05, 3, 0], [1.22, 6, 3]],
    lines: ['Now the human in us is fading. Folk go wild.', 'Doctors call it the Slip.'] },
  { img: 'assets/intro/5-helix.webp', tag: 'Helix', cap: 'br', kb: [[1.22, 8, 3], [1.06, 0, 0]],
    lines: ['Only Ice holds the Slip off. Helix makes every vial.', 'Augustus Vale owns Helix. He sets the price, and who gets it.'] },
  { img: 'assets/intro/7b-ration.webp', tag: 'The ration line', cap: 'br', kb: [[1.04, -2, 0], [1.2, 4, 2]],
    lines: ['Helix rations Ice. Merc pay doesn’t cover Vale’s price any more.', 'And I’m slipping. My claws don’t stay in. Nobody can know.'] },
  { img: 'assets/intro/6-hire.webp', tag: 'The rebels', cap: 'br', kb: [[1.05, -2, 0], [1.2, 6, 2]],
    lines: ['Bracken Hale’s rebels steal Ice from Helix and pay their muscle in it.', 'Hit a Helix shipment at the docks. Get paid in Ice I can’t buy anywhere else.'] },
  { img: 'assets/intro/7-rook.webp', tag: 'Rook', cap: 'bl', kb: [[1.04, -3, 0], [1.24, -8, 2]],
    lines: ['I don’t care about their cause. I care about staying me.', 'Name’s Rook. Tonight, I work for the rebels.'] },
];
// One-panel story beats between the guided steps.
const BEATS = {
  paid: { img: 'assets/intro/6-hire.webp', tag: 'After the job', cap: 'tr', kb: [[1.2, 6, 2], [1.06, 0, 0]], btn: 'Back to the hideout',
    lines: ['Hale paid in Ice. Two vials. A month of being me.', 'Helix will want it back. Time to dig in.'] },
  raid: { img: 'assets/intro/5-helix.webp', tag: 'Helix tower', cap: 'br', kb: [[1.06, 0, 0], [1.24, -4, 2]], btn: 'Defend the hideout',
    lines: ['Vale doesn’t lose shipments. He sends people.', 'They found my door.'] },
  end: { img: 'assets/intro/7-rook.webp', tag: 'Fang City', cap: 'bl', kb: [[1.24, -8, 2], [1.04, 0, 0]], btn: 'Look round the hideout',
    lines: ['Helix will be back. So will I.', 'Time I knew what this place can do.'] },
};

export const active = (s) => !!(s && s.intro && s.intro.step && s.intro.step !== 'done');
export const step = (s) => (s && s.intro && s.intro.step) || 'done';
const builds = (s) => (s.stats.builds || 0) + (s.stats.upgrades || 0);

export function begin(s, replay = false) {
  s.intro = { step: 'story', crafted: 0, replay: replay ? 1 : 0 };
  forget(TEACH);
  if (!replay) freshStart(s);
}
// v0.20.2 a brand-new crew starts lean: Rook carries only his tyre iron and snub revolver (the docks job needs
// both), the stash is empty, and his gear slots open with HIS level (Lv 1: weapons, jacket, boots). Only a
// save that is still exactly the new-game kit is touched, so ?intro=1 on a played save never strips anything.
function freshStart(s) {
  const rec = s.heroes && s.heroes.owned && s.heroes.owned.rook;
  if (!rec || (s.player && (s.player.lv > 1 || s.player.xp > 0)) || rec.lv > 1 || rec.xp > 0) return;
  const start = defaultEquip('rook'), eq = rec.equip || {};
  if (Object.keys(eq).length !== Object.keys(start).length || Object.keys(start).some((k) => eq[k] !== start[k])) return;
  rec.equip = { melee: start.melee || 'tyreiron', primary: start.primary || 'snub' };
  s.stash = {};
  s.slotsByHero = 1;
}
function goStep(s, id) {
  s.intro.step = id;
  if (id === 'base') s.intro.b0 = builds(s);
  if (id === 'equip') {
    const rec = s.heroes.owned.rook, item = (s.intro.made || [])[0] || 'leather';
    s.intro.e0 = s.stats.equips || 0;
    s.intro.item = item;
    s.intro.slot = targetSlot(rec, item, s, 'rook');
    s.intro.st0 = rookStats(s);
  }
}
// The stats the equip step compares before / after (Rook's sheet with his current gear).
const SHOW = [['hp', 'HP'], ['armor', 'Armour'], ['mdmg', 'Melee dmg'], ['rdmg', 'Gun dmg'], ['aim', 'Aim'], ['dodge', 'Dodge'], ['speed', 'Speed'], ['move', 'Move']];
function rookStats(s) {
  const r = s.heroes.owned.rook, st = statsFor('rook', { stars: r.stars, lv: r.lv, perks: r.perks, gear: r.gear, equip: r.equip || {} });
  const o = {}; for (const [k] of SHOW) o[k] = st[k] || 0; return o;
}
export const equipped = (s) => active(s) && s.intro.step === 'equip' && (s.stats.equips || 0) > (s.intro.e0 || 0);
function statDiff(s) {
  const a = s.intro.st0 || {}, b = rookStats(s);
  return SHOW.filter(([k]) => (a[k] || 0) !== b[k]).map(([k, n]) => `${n} ${a[k] || 0} → <b class="${b[k] > (a[k] || 0) ? 'green' : 'red'}">${b[k]} ${b[k] > (a[k] || 0) ? '▲' : '▼'}</b>`).join(', ');
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
  if (b.intro === 2 && s.intro.step === 'm2') { goStep(s, 'tour'); s.intro.beat = 'end'; s.intro.seen ||= {}; s.intro.tourI = 0; }
}
// After the base renders: play a waiting story beat (never over a modal or a fight).
export function afterRender(ctx) {
  const s = ctx.state, it = s && s.intro;
  equipCoach(ctx);
  if (!it) return;
  if (it.step === 'story') { if (!document.querySelector('.introsb')) storyboard(ctx, PANELS, { onDone: () => toMission1(ctx), skippable: true }); return; }
  if (ctx.tab === 'base') lockMarks(ctx);
  if (!it.beat && it.step === 'tour' && ctx.tab === 'base' && !document.querySelector('.overlay, .introsb, .ttour')) { setTimeout(() => { if (ctx.tab === 'base' && step(s) === 'tour' && !document.querySelector('.ttour, .introsb, .overlay')) baseTour(ctx); }, ctx.fast ? 50 : 500); return; }
  if (!it.beat || ctx.tab !== 'base' || document.querySelector('.overlay, .introsb')) return;
  const id = it.beat, beat = BEATS[id];
  storyboard(ctx, [beat], { btn: beat.btn, onDone: () => {
    if (s.intro.beat === id) delete s.intro.beat;
    ctx.save();
    if (id === 'raid') startM2(ctx); else ctx.render();
  } });
}

// Equip step away from the hideout: one compact coach line that follows what's on screen, and a glow on the
// thing to tap (Rook -> his gear slot -> the crafted item -> see the stat change -> back).
function equipCoach(ctx) {
  const s = ctx.state, old = document.querySelector('.introcoach');
  document.querySelectorAll('.introglow:not(.bigbtn)').forEach((n) => n.classList.remove('introglow'));
  if (!active(s) || s.intro.step !== 'equip' || ctx.tab === 'base' || s.tactics) { old && old.remove(); return; }
  const it = s.intro, nm = esc((ITEMS[it.item] || {}).name || 'new gear'), slotNm = esc((SLOT_BY_ID[it.slot] || {}).name || 'matching');
  const c = ctx.sub.char || {};
  let html = '', glowSel = '', cta = '';
  if (equipped(s)) {
    const d = statDiff(s);
    html = `Equipped. ${d ? d + '. ' : ''}Gear changes his stats: check the panel by his portrait.`;
    cta = '<button class="btn sm red" data-act="introEquipDone">Back to the hideout</button>';
  } else if (ctx.tab === 'hero' && c.hero === 'rook') {
    if (c.sel && c.sel.from === 'slot' && c.sel.slot === it.slot) { html = `Now tap the <b>${nm}</b> in the stash to put it on.`; glowSel = `.sitem[data-id="${it.item}"]`; }
    else if (c.sel && c.sel.from === 'stash' && c.sel.id === it.item) { html = 'The arrows show what changes. Tap <b>Equip</b>.'; glowSel = `[data-act="charEquip"][data-id="${it.item}"]`; }
    else { html = `Tap Rook’s <b>${slotNm}</b> slot to see what fits.`; glowSel = `.cslot[data-slot="${it.slot}"]`; }
  } else { html = 'Open Rook’s gear to put on what you made.'; cta = '<button class="btn sm red" data-act="openHero" data-id="rook">Open Rook’s gear</button>'; }
  const el = old || document.createElement('div');
  el.className = 'introcoach';
  el.innerHTML = `<img src="assets/heroes/rook-64.webp" alt="" decoding="async"><div class="small grow">${html}</div>${cta}`;
  if (!old) document.getElementById('app').appendChild(el);
  const tgt = glowSel && document.querySelector(glowSel);
  if (tgt) tgt.classList.add('introglow');
  // never sit on top of the thing it points at: hop to the top edge if the target is down by the coach
  el.classList.remove('top');
  if (tgt) { const a = tgt.getBoundingClientRect(), c = el.getBoundingClientRect(); if (a.bottom > c.top - 4 && a.top < c.bottom) el.classList.add('top'); }
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
  // v0.20.2 lesson layout: Hook stands in the open where Rook can reach cover with a fair shot on turn 1
  // (the lesson's turn 1: move into cover, Shoot, End turn; turn 2: Pounce).
  const hook = b.units.find((q) => q.hero === 'hook');
  if (hook && T.walkable(b, 11, 8, hook.uid)) { hook.x = 11; hook.y = 8; }
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
  // Helix came ready: one gun starts on Overwatch (it clears on his own turn), so the fight can teach it
  const ow = b.units.find((q) => q.side === 'enemy' && T.gunOf(q));
  if (ow) ow.overwatch = true;
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
  { id: 'intro-m2', once: false,
    when: ({ b, a }) => b.intro === 2 && b.turn === 1 && !a.moved && !a.acted,
    done: ({ u, a }) => !!(u.preview || a.moved || a.acted),
    html: () => '<b>Helix found the hideout.</b> Two hired guns. You know the drill now: cover, close in, hit hard.' },
];

// The step card on the hideout (replaces Boss's orders while the intro runs).
export function baseCard(ctx) {
  const s = ctx.state;
  if (!active(s) || s.intro.step === 'story' || s.intro.step === 'tour') return '';
  const it = s.intro, place = ctx.sub.base && ctx.sub.base.place;
  const n = { m1: 1, base: 2, craft: 3, equip: 4, m2: 5 }[it.step] || 1;
  let line = '', cta = '';
  if (it.step === 'm1') { line = 'Hale pays in Ice. The Helix shipment is sitting at the docks.'; cta = '<button class="btn sm red" data-act="introM1">Hit the docks</button>'; }
  else if (it.step === 'base') {
    line = place ? 'Drag it to a clear spot, then tap <b>✔</b> to build.' : 'Ice doesn’t pay rent. Cash does. Build a <b>Knock-off Stall</b>.';
    cta = place ? '' : '<button class="btn sm red" data-act="openBuild">Build</button>';
  } else if (it.step === 'craft') { line = 'The crate had more than Ice: scrap and tools. Make Rook something useful.'; cta = '<button class="btn sm red" data-act="introBench">Open the bench</button>'; }
  else if (it.step === 'equip') {
    const nm = esc((ITEMS[it.item] || {}).name || 'new gear');
    line = equipped(s) ? 'Rook’s geared up. Helix won’t wait.' : `Gear sitting in the stash does nothing. Put the <b>${nm}</b> on Rook.`;
    cta = equipped(s) ? '<button class="btn sm red" data-act="introEquipDone">Carry on</button>' : '<button class="btn sm red" data-act="openHero" data-id="rook">Open Rook’s gear</button>';
  } else if (it.step === 'm2') { line = 'Helix is at the door.'; cta = '<button class="btn sm red" data-act="introM2">Defend</button>'; }
  return `<div class="introcard"><img src="assets/heroes/rook-64.webp" alt="" decoding="async">
    <div class="grow"><div class="tiny h"><span class="red">Rook</span> · <span class="dim">Intro ${n}/5</span></div><div class="small">${line}</div></div>
    <div class="col">${cta}<button class="linkbtn tiny" data-act="introSkip">Skip intro</button></div></div>`;
}
// Hideout re-renders the card when this changes (step, or placing a building).
export const key = (ctx) => `i:${step(ctx.state)}:${ctx.sub.base && ctx.sub.base.place ? 1 : 0}:${equipped(ctx.state) ? 1 : 0}`;
// Gentle glow on the hideout button the current step needs.
export const glow = (s, what) => ((active(s) && what === 'build' && s.intro.step === 'base') || (what === 'nextop' && s && s.intro && s.intro.nudge)) ? ' introglow' : '';

// ---------------------------------------------------------------- v0.20.2 hideout tour + feature locks
// Until the intro has shown a feature, it stays locked (dimmed, padlocked, a tap just says it's coming).
// After Mission 2 the tour walks the hideout one feature at a time, unlocking each as it explains it, and ends
// on Next op (the story) left open for the player to start.
export const BASE_TOUR = [
  { f: 'den', building: 'den', text: '<b>The Den</b>: the heart of the hideout. Upgrade it to raise every other building’s max level.' },
  { f: 'stall', building: 'stall', text: 'Your <b>Knock-off Stall</b> makes Cash over time. Tap the coin bubble over it to collect.' },
  { f: 'buildings', sel: '.hud-br [data-act="openBuild"]', text: '<b>Build</b>: new buildings and upgrades. More open as your Den and level grow. Tap any building to upgrade it.' },
  { f: 'builders', sel: '[data-act="builders"]', text: '<b>Builders</b>: every build or upgrade keeps one busy until it’s done.' },
  { f: 'supplies', sel: '.pillbtn.supplies', text: '<b>Ammo and medkits</b>. Fights use them up; the hideout makes more.' },
  { f: 'cash', sel: '#topbar .res.cash', text: '<b>Cash</b> pays for buildings and upgrades. The bar shows how full your storage is.' },
  { f: 'energy', sel: '#topbar [data-act="energyInfo"]', text: '<b>Energy</b>: each op costs ⚡1, and it refills 1 every 10 minutes.' },
  { f: 'level', sel: '#topbar [data-act="openTrack"]', text: 'Your <b>player level</b>. Ops and goals give XP; each level opens something new.' },
  { f: 'crew', sel: '#nav [data-tab="crew"]', text: '<b>Crew</b>: your operators. Tap one for gear, abilities and perks. Slots open as they level.' },
  { f: 'ops', sel: '#nav [data-tab="missions"], .hud-br [data-tab="missions"]', text: '<b>Ops</b>: every job on the map. Replay a finished one for half rewards.' },
  { f: 'locked', sel: '#nav .locked', text: 'Padlocked tabs open at the player level shown on them.' },
  { f: 'ad', sel: '[data-act="adBoost"]', text: '<b>x2 cash</b> (optional): watch a short ad and your buildings make double for a while.' },
  { f: 'story', sel: '.nextop', text: '<b>Next op</b> carries the story on. Tap it when you’re ready. The hideout’s yours.' },
];
const FEAT_SEL = Object.fromEntries(BASE_TOUR.filter((t) => t.sel).map((t) => [t.f, t.sel]));
// what each tap needs (act -> feature); building taps need 'den'
const ACT_FEAT = { builders: 'builders', adBoost: 'ad', energyInfo: 'energy', openTrack: 'level', startOp: 'story', openBuild: 'buildings', collectStockHud: 'supplies' };
const TAB_FEAT = { crew: 'crew', missions: 'ops' };
const IMPLICIT = { buildings: ['base', 'craft', 'equip', 'm2', 'tour'] };
export function locked(s, f) {
  if (!active(s) || !f) return false;
  const it = s.intro;
  if ((it.seen || {})[f]) return false;
  if ((IMPLICIT[f] || []).includes(it.step)) return false;
  return true;
}
// called by app.js before every tap: a message if the intro hasn't opened that feature yet
export function lockFor(ctx, act, el) {
  const s = ctx.state;
  if (act === 'startOp' && s && s.intro && s.intro.nudge) { delete s.intro.nudge; }
  if (!active(s)) return null;
  if (s.intro.step === 'base' && act === 'openBuild') return null;
  const f = act === 'nav' ? TAB_FEAT[el && el.dataset.tab] : ACT_FEAT[act];
  return f && locked(s, f) ? 'Locked for now: the intro will show you this.' : null;
}
function lockMarks(ctx) {
  const s = ctx.state;
  document.querySelectorAll('.introlock').forEach((n) => n.classList.remove('introlock'));
  if (!active(s)) return;
  for (const [f, sel] of Object.entries(FEAT_SEL)) {
    if (f === 'locked') continue;
    if (locked(s, f)) document.querySelectorAll(sel).forEach((n) => n.classList.add('introlock'));
  }
}
function baseTour(ctx) {
  const s = ctx.state, it = s.intro;
  if (document.querySelector('.ttour')) return;
  it.seen ||= {};
  const el = document.createElement('div');
  el.className = 'ttour introtour';
  const W = () => window.innerWidth, H = () => window.innerHeight;
  const rectOf = (st) => {
    if (st.building) {
      const b = (s.base.buildings || []).find((x) => x.t === st.building);
      if (!b || !window.__base) return null;
      try { window.__base.centerOn(b.id); } catch (e) { /* view not ready */ }
      const p = window.__base.screenOf(b.id);
      return p ? { left: p.x - 55, top: p.y - 70, width: 110, height: 100 } : null;
    }
    const ns = [...document.querySelectorAll(st.sel)].filter((n) => n.getBoundingClientRect().width > 0);
    if (!ns.length) return null;
    const rs = ns.map((n) => n.getBoundingClientRect());
    const l = Math.min(...rs.map((r) => r.left)), t = Math.min(...rs.map((r) => r.top)), r2 = Math.max(...rs.map((r) => r.right)), b2 = Math.max(...rs.map((r) => r.bottom));
    return { left: l, top: t, width: r2 - l, height: b2 - t };
  };
  const finish = (all) => {
    el.remove();
    for (const t of BASE_TOUR) it.seen[t.f] = 1;
    it.step = 'done'; it.nudge = 1; delete it.tourI;
    ctx.save(); ctx.render();
    if (!all) ctx.toast('Everything’s unlocked. Next op when you’re ready.');
  };
  const draw = () => {
    let i = it.tourI || 0;
    while (i < BASE_TOUR.length && !rectOf(BASE_TOUR[i])) { it.seen[BASE_TOUR[i].f] = 1; i++; }
    it.tourI = i;
    if (i >= BASE_TOUR.length) return finish();
    try { window.__base && window.__base.deselect && window.__base.deselect(); } catch (e) { /* no panel */ }
    const st = BASE_TOUR[i], r = rectOf(st), pad = 5;
    it.seen[st.f] = 1; ctx.save();
    document.querySelectorAll(st.sel || '.__none').forEach((n) => n.classList.remove('introlock'));
    const hole = { l: Math.max(2, r.left - pad), t: Math.max(2, r.top - pad), w: r.width + pad * 2, h: r.height + pad * 2 };
    const capW = Math.min(300, W() - 24);
    const below = hole.t + hole.h / 2 < H() / 2;
    const x = Math.min(Math.max(12, hole.l + hole.w / 2 - capW / 2), W() - capW - 12);
    const pos = below ? `top:${Math.min(hole.t + hole.h + 10, H() - 130)}px` : `bottom:${Math.min(H() - hole.t + 10, H() - 60)}px`;
    const last = i === BASE_TOUR.length - 1;
    el.innerHTML = `<div class="ttourhole" style="left:${hole.l}px;top:${hole.t}px;width:${hole.w}px;height:${hole.h}px"></div>
      <div class="ttourcap" style="left:${x}px;${pos};width:${capW}px" data-step="${i}" data-f="${st.f}"><div class="tiny dim">Hideout tour · ${i + 1}/${BASE_TOUR.length} · <span class="gold">Unlocked</span></div><div class="small">${st.text}</div>
      <div class="ttourbtns"><button class="linkbtn tiny" data-tour="skip">Skip tour</button><button class="btn sm red" data-tour="next">${last ? 'Got it' : 'Next ›'}</button></div></div>`;
  };
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    const t = e.target.closest('[data-tour]');
    if (t && t.dataset.tour === 'skip') return finish(true);
    if ((it.tourI || 0) >= BASE_TOUR.length - 1) return finish();
    it.tourI = (it.tourI || 0) + 1; draw();
  });
  document.getElementById('app').appendChild(el);
  draw();
}

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
    const btn = made ? `<span class="tiny gold">${worn ? 'On Rook ✔' : 'Made ✔ · in the stash'}</span>`
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
  introEquipDone: (ctx) => {
    const s = ctx.state;
    if (!equipped(s)) return;
    goStep(s, 'm2'); s.intro.beat = 'raid';
    ctx.save(); ctx.go('base');
  },
  introBenchDone: (ctx) => {
    const s = ctx.state;
    if (!(s.intro.made || []).length) return;
    goStep(s, 'equip');
    ctx.closeModal(true); ctx.save(); ctx.render();
  },
};
