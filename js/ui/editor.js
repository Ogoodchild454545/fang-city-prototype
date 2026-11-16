// Map editor: build your own battle maps. Top-down grid editing (precise on a phone) with a live
// iso preview that uses the real battle renderer; both views can be painted. Maps are stored as
// v1 map JSON (js/core/mapfmt.js), saved in localStorage and playable straight away.
import {
  GROUND, PROPS, MAP_SIZES, CONTAINER_HUES, VAN_HUES, blankMapJson, normalizeMapJson, mapFromJson,
  validateMap, objectTiles, stringifyMap,
} from '../core/mapfmt.js';
import { listMaps, saveMap, deleteMap, getMap } from '../core/custommaps.js';
import { DOCKLANDS } from '../core/maps/docklands.js';
import { startCustom } from '../core/tactics.js';
import * as Dock from './dockart.js';
import { esc } from './fmt.js';

// ---------- tools ----------
const TOOLS = [
  { g: 'Ground', id: 'g.', label: 'Concrete', ico: '⬜' },
  { g: 'Ground', id: 'g~', label: 'Water', ico: '🌊' },
  { g: 'Ground', id: 'g=', label: 'Quay edge', ico: '▤' },
  { g: 'Ground', id: 'gs', label: 'Canopy', ico: '⛺' },
  { g: 'Ground', id: 'go', label: 'Office floor', ico: '▦' },
  { g: 'Ground', id: 'gr', label: 'Bar floor', ico: '▩' },
  { g: 'Build', id: 'room', label: 'Room', ico: '🏠' },
  { g: 'Build', id: 'c1', label: 'Container', ico: '📦' },
  { g: 'Build', id: 'c2', label: 'Double stack', ico: '🧱' },
  { g: 'Build', id: 'van', label: 'Van', ico: '🚐' },
  { g: 'Build', id: 'px', label: 'Crates', ico: '🟫' },
  { g: 'Build', id: 'pb', label: 'Barrel', ico: '🛢️' },
  { g: 'Build', id: 'pf', label: 'Burn barrel', ico: '🔥' },
  { g: 'Build', id: 'pB', label: 'Barrier', ico: '🚧' },
  { g: 'Build', id: 'pn', label: 'Fence', ico: '⛓️' },
  { g: 'Build', id: 'pl', label: 'Lamp', ico: '💡' },
  { g: 'Build', id: 'pW', label: 'Wall', ico: '🧱' },
  { g: 'Build', id: 'pD', label: 'Door', ico: '🚪' },
  { g: 'Build', id: 'pk', label: 'Counter', ico: '🪑' },
  { g: 'Build', id: 'ph', label: 'Shelf', ico: '🗄️' },
  { g: 'Build', id: 'boat', label: 'Boat', ico: '🚤' },
  { g: 'Spawns', id: 'sP', label: 'Your spawn', ico: '🔵' },
  { g: 'Spawns', id: 'sE', label: 'Enemy spawn', ico: '🔴' },
  { g: 'Edit', id: 'rot', label: 'Rotate / flip', ico: '⟳' },
  { g: 'Edit', id: 'erase', label: 'Eraser', ico: '⌫' },
];
const DRAG_TOOLS = (id) => id[0] === 'g' || id[0] === 'p' || id[0] === 's' || id === 'erase';
const ROOM_HUES = ['office', 'cafe'];

function ed(ctx) {
  if (!ctx.sub.editor) {
    ctx.sub.editor = {
      doc: normalizeMapJson(blankMapJson('medium', 'My map')),
      undo: [], redo: [], tool: 'c1', dir: 'E', len: 2, hue: 'green', vanHue: 'white', roomHue: 'office',
      view: 'top', zoom: 1, pan: { x: 0, y: 0 }, saved: true,
    };
    ctx.sub.editor.doc.spawn = defaultSpawns(ctx.sub.editor.doc);
  }
  return ctx.sub.editor;
}
function defaultSpawns(d) {
  const rows = d.spawn.map((r) => r.split(''));
  const ys = [2, 4, 6, 8].map((k) => Math.round((k / 10) * (d.h - 1)));
  for (const y of ys) { rows[y][1] = 'P'; rows[y][2] = 'P'; rows[y][d.w - 2] = 'E'; rows[y][d.w - 3] = 'E'; }
  return rows.map((r) => r.join(''));
}

export function openEditor(ctx, id) {
  const e = ed(ctx);
  if (id) {
    const j = getMap(id);
    if (j) loadDoc(e, id === 'docklands' ? { ...j, id: 'map-' + Date.now().toString(36), name: 'Docklands copy', seats: undefined, flavour: undefined } : j);
  }
  ctx.go('editor');
}
function loadDoc(e, j) {
  const d = normalizeMapJson(j);
  delete d.seats; delete d.flavour;
  e.doc = d; e.undo = []; e.redo = []; e.saved = true; e.zoom = 1; e.pan = { x: 0, y: 0 }; e.map = null;
}

// ---------- doc helpers ----------
const setCh = (rows, x, y, c) => { const r = rows[y]; rows[y] = r.slice(0, x) + c + r.slice(x + 1); };
const inside = (d, x, y) => x >= 0 && y >= 0 && x < d.w && y < d.h;
const objAt = (d, x, y) => d.objects.find((o) => objectTiles(o).some(([a, b]) => a === x && b === y));
function snapshot(e) { e.undo.push(JSON.stringify(e.doc)); if (e.undo.length > 120) e.undo.shift(); e.redo = []; }
function changed(e) { e.saved = false; e.map = null; e.check = null; }
function clearTile(d, x, y, { keepSpawn = false } = {}) {
  const o = objAt(d, x, y);
  if (o) d.objects.splice(d.objects.indexOf(o), 1);
  setCh(d.props, x, y, '.');
  if (!keepSpawn) setCh(d.spawn, x, y, '.');
}
const isWater = (d, x, y) => d.ground[y][x] === '~';
const solidAt = (d, x, y) => objAt(d, x, y) || (PROPS[d.props[y][x]] && PROPS[d.props[y][x]].block !== 0 && !PROPS[d.props[y][x]].door);
// Front walls (with room floor behind them, north or west) are drawn low so you can see in.
function autoWall(d, x, y, door) {
  const fl = (xx, yy) => inside(d, xx, yy) && 'or'.includes(d.ground[yy][xx]);
  const low = fl(x, y - 1) || fl(x - 1, y) || fl(x - 1, y - 1);
  return door ? (low ? 'd' : 'D') : (low ? 'w' : 'W');
}

function applyTool(ctx, x, y, first) {
  const e = ed(ctx), d = e.doc, t = e.tool;
  if (!inside(d, x, y)) return false;
  if (t[0] === 'g') {
    const c = t[1];
    if (d.ground[y][x] === c) return false;
    setCh(d.ground, x, y, c);
    if (c === '~') { const o = objAt(d, x, y); if (o && o.k !== 'boat') d.objects.splice(d.objects.indexOf(o), 1); setCh(d.props, x, y, '.'); setCh(d.spawn, x, y, '.'); }
    else { const o = objAt(d, x, y); if (o && o.k === 'boat') d.objects.splice(d.objects.indexOf(o), 1); }
    return true;
  }
  if (t[0] === 'p') {
    let c = t[1];
    if (isWater(d, x, y)) return false;
    if (c === 'W' || c === 'D') c = autoWall(d, x, y, c === 'D');
    if (d.props[y][x] === c && !objAt(d, x, y)) return false;
    clearTile(d, x, y, { keepSpawn: !!(PROPS[c].block === 0 || PROPS[c].door) });
    setCh(d.props, x, y, c);
    return true;
  }
  if (t[0] === 's') {
    const c = t[1];
    if (isWater(d, x, y) || solidAt(d, x, y) || d.spawn[y][x] === c) return false;
    setCh(d.spawn, x, y, c);
    return true;
  }
  if (t === 'erase') {
    const o = objAt(d, x, y);
    if (o) { d.objects.splice(d.objects.indexOf(o), 1); return true; }
    if (d.props[y][x] !== '.') { setCh(d.props, x, y, '.'); return true; }
    if (d.spawn[y][x] !== '.') { setCh(d.spawn, x, y, '.'); return true; }
    return false;
  }
  if (!first) return false;
  if (t === 'c1' || t === 'c2' || t === 'van' || t === 'boat') {
    const o = t === 'van' ? { k: 'van', x, y, dir: e.dir, hue: e.vanHue }
      : t === 'boat' ? { k: 'boat', x, y, hue: ['tug', 'work', 'small'][(x + y) % 3] }
      : { k: 'container', x, y, len: e.len, dir: e.dir, stack: t === 'c2' ? 2 : 1, hue: e.hue };
    if (o.k === 'container') {
      // shorten the run if it would leave the map or hit water
      while (o.len > 1 && objectTiles(o).some(([a, b]) => !inside(d, a, b) || isWater(d, a, b))) o.len--;
    }
    const cells = objectTiles(o);
    if (cells.some(([a, b]) => !inside(d, a, b))) return toastNo(ctx, 'No room there.');
    if (o.k === 'boat' ? cells.some(([a, b]) => !isWater(d, a, b)) : cells.some(([a, b]) => isWater(d, a, b))) return toastNo(ctx, o.k === 'boat' ? 'Boats go on water.' : "Can't build on water.");
    for (const [a, b] of cells) clearTile(d, a, b);
    d.objects.push(o);
    if (o.k === 'container') e.hue = CONTAINER_HUES[(CONTAINER_HUES.indexOf(e.hue) + 1) % CONTAINER_HUES.length];
    return true;
  }
  if (t === 'rot') {
    const o = objAt(d, x, y);
    if (o && o.k !== 'boat') {
      const n = { ...o, dir: o.dir === 'S' ? 'E' : 'S' };
      const cells = objectTiles(n);
      const others = d.objects.filter((q) => q !== o);
      const bad = cells.some(([a, b]) => !inside(d, a, b) || isWater(d, a, b) || others.some((q) => objectTiles(q).some(([p, r]) => p === a && r === b)) || (d.props[b][a] !== '.' && !objectTiles(o).some(([p, r]) => p === a && r === b)));
      if (bad) return toastNo(ctx, 'No room to rotate it there.');
      Object.assign(o, n);
      for (const [a, b] of cells) setCh(d.spawn, a, b, '.');
      return true;
    }
    const swap = { W: 'w', w: 'W', D: 'd', d: 'D' }[d.props[y][x]];
    if (swap) { setCh(d.props, x, y, swap); return true; }
    return false;
  }
  return false;
}
function toastNo(ctx, msg) { ctx.toast(msg); return false; }

function placeRoom(ctx, a, b) {
  const e = ed(ctx), d = e.doc;
  const x0 = Math.max(0, Math.min(a.x, b.x)), x1 = Math.min(d.w - 1, Math.max(a.x, b.x));
  const y0 = Math.max(0, Math.min(a.y, b.y)), y1 = Math.min(d.h - 1, Math.max(a.y, b.y));
  if (x1 - x0 < 2 || y1 - y0 < 2) { ctx.toast('Drag out a room at least 3 × 3.'); return false; }
  const fl = e.roomHue === 'cafe' ? 'r' : 'o';
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    clearTile(d, x, y);
    if (isWater(d, x, y)) setCh(d.ground, x, y, '.');
    if (x > x0 && x < x1 && y > y0 && y < y1) setCh(d.ground, x, y, fl);
  }
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (x > x0 && x < x1 && y > y0 && y < y1) continue;
    const front = y === y1 || x === x1; // walls nearest the camera are cut away
    setCh(d.props, x, y, front ? 'w' : 'W');
  }
  // doorway in the middle of the south wall
  const dx = Math.floor((x0 + x1) / 2);
  setCh(d.props, dx, y1, 'd');
  setCh(d.ground, dx, y1, fl);
  return true;
}

function resize(e, size) {
  const [w, h] = MAP_SIZES[size];
  const d = e.doc;
  const fit = (rows) => Array.from({ length: h }, (_, y) => ((rows[y] || '') + '.'.repeat(w)).slice(0, w));
  d.ground = fit(d.ground); d.props = fit(d.props); d.spawn = fit(d.spawn);
  d.w = w; d.h = h;
  d.objects = d.objects.filter((o) => objectTiles(o).every(([a, b]) => a < w && b < h));
}

// ---------- render ----------
export function render(ctx) {
  const e = ed(ctx), d = e.doc;
  const sizeKey = Object.keys(MAP_SIZES).find((k) => MAP_SIZES[k][0] === d.w && MAP_SIZES[k][1] === d.h) || 'custom';
  const v = e.check || (e.check = validateMap(d));
  const groups = [...new Set(TOOLS.map((t) => t.g))];
  const opt = optionsFor(e);
  return `
  <div class="edscr">
    <div class="edtop">
      <button class="btn sm" data-act="edMenu" title="Maps">☰ Maps</button>
      <input id="edname" class="edname" maxlength="40" value="${esc(d.name)}" aria-label="Map name">
      <select class="edsel" data-act="edSize" aria-label="Map size">
        ${Object.entries(MAP_SIZES).map(([k, [w, h]]) => `<option value="${k}" ${k === sizeKey ? 'selected' : ''}>${k[0].toUpperCase() + k.slice(1)} ${w}×${h}</option>`).join('')}
        ${sizeKey === 'custom' ? `<option value="custom" selected>${d.w}×${d.h}</option>` : ''}
      </select>
      <button class="btn sm" data-act="edUndo" ${e.undo.length ? '' : 'disabled'} title="Undo">↶</button>
      <button class="btn sm" data-act="edRedo" ${e.redo.length ? '' : 'disabled'} title="Redo">↷</button>
      <button class="btn sm" data-act="edDir" title="Direction for new containers and vans">${e.dir === 'E' ? '↘ along x' : '↙ along y'}</button>
      <button class="btn sm" data-act="edView">${e.view === 'top' ? '3D view' : 'Grid view'}</button>
      <span class="grow"></span>
      <button class="btn sm" data-act="edSave">${e.saved ? 'Saved' : 'Save'}</button>
      <button class="btn sm red" data-act="edPlay">▶ Play</button>
      <button class="btn sm" data-act="edExit" title="Close">✕</button>
    </div>
    <div class="edbody">
      <div class="edtools">
        ${opt}
        ${groups.map((g) => `<div class="edgrp">${g}</div><div class="edgrid">${TOOLS.filter((t) => t.g === g).map((t) => `<button class="edtool ${e.tool === t.id ? 'on' : ''}" data-act="edTool" data-tool="${t.id}" title="${esc(t.label)}"><span>${t.ico}</span>${esc(t.label)}</button>`).join('')}</div>`).join('')}
      </div>
      <div class="edcanvas">
        <canvas id="edcv"></canvas>
        <div class="edzoom"><button data-act="edZoom" data-z="1">＋</button><button data-act="edZoom" data-z="-1">－</button><button data-act="edZoom" data-z="0">⤢</button></div>
        <button class="edstatus ${v.ok ? (v.warnings.length ? 'warn' : 'ok') : 'bad'}" data-act="edIssues">${v.ok ? (v.warnings.length ? `⚠ ${v.warnings.length} warning${v.warnings.length > 1 ? 's' : ''} · playable` : '✓ Ready to play') : `✕ ${v.errors.length} problem${v.errors.length > 1 ? 's' : ''}`}</button>
        <div class="edhint" id="edhint"></div>
      </div>
    </div>
  </div>`;
}
function optionsFor(e) {
  const sw = (list, cur, act, cls = '') => list.map((h) => `<button class="edsw ${cls} ${h === cur ? 'on' : ''}" data-act="${act}" data-v="${h}" style="--c:${SWATCH[h] || '#888'}" title="${h}"></button>`).join('');
  if (e.tool === 'c1' || e.tool === 'c2') {
    return `<div class="edopt"><div class="edgrp">Length</div><div class="edrow">${[1, 2, 3, 4].map((n) => `<button class="edlen ${e.len === n ? 'on' : ''}" data-act="edLen" data-v="${n}">${n}</button>`).join('')}</div>
      <div class="edrow">${sw(CONTAINER_HUES, e.hue, 'edHue')}</div></div>`;
  }
  if (e.tool === 'van') return `<div class="edopt"><div class="edrow">${sw(VAN_HUES, e.vanHue, 'edVanHue')}</div></div>`;
  if (e.tool === 'room') return `<div class="edopt"><div class="edgrp">Drag a rectangle</div><div class="edrow">${ROOM_HUES.map((h) => `<button class="edlen wide ${e.roomHue === h ? 'on' : ''}" data-act="edRoomHue" data-v="${h}">${h === 'cafe' ? 'Bar' : 'Office'}</button>`).join('')}</div></div>`;
  return '';
}
const SWATCH = { green: '#40683f', rust: '#8e3c24', teal: '#2c6a62', blue: '#30557a', mustard: '#a27c2c', grey: '#6a6e70', red: '#8a2c22', white: '#c4beb2' };

// ---------- canvas ----------
let RAF = 0;
export function mount(ctx) {
  const e = ed(ctx);
  const cv = document.getElementById('edcv');
  if (!cv) return;
  const name = document.getElementById('edname');
  name.addEventListener('input', () => { e.doc.name = name.value.slice(0, 40) || 'Untitled map'; e.saved = false; });
  name.addEventListener('keydown', (ev) => ev.stopPropagation());
  bind(ctx, cv);
  draw(ctx);
  if (!window.__edKeys) {
    window.__edKeys = 1;
    window.addEventListener('keydown', (ev) => {
      if (ctx.tab !== 'editor' || ev.target.tagName === 'INPUT' || ev.target.tagName === 'TEXTAREA') return;
      const k = ev.key.toLowerCase();
      if ((ev.ctrlKey || ev.metaKey) && k === 'z') { ev.preventDefault(); actions[ev.shiftKey ? 'edRedo' : 'edUndo'](ctx); }
      else if ((ev.ctrlKey || ev.metaKey) && k === 'y') { ev.preventDefault(); actions.edRedo(ctx); }
      else if ((ev.ctrlKey || ev.metaKey) && k === 's') { ev.preventDefault(); actions.edSave(ctx); }
      else if (k === 'r' && !ev.ctrlKey && !ev.metaKey) actions.edDir(ctx);
    });
    window.addEventListener('resize', () => { if (ctx.tab === 'editor') draw(ctx); });
  }
}

function geom(ctx, cv) {
  const e = ed(ctx), d = e.doc;
  const dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth, H = cv.clientHeight;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  if (e.view === 'top') {
    const ts = Math.max(4, Math.min((W - 16) / d.w, (H - 40) / d.h)) * e.zoom;
    const ox = (W - ts * d.w) / 2 + e.pan.x, oy = (H - 30 - ts * d.h) / 2 + e.pan.y;
    return { dpr, W, H, ts, ox, oy, iso: false };
  }
  // iso: fit the whole map
  const HX = Dock.TW / 2, HY = Dock.TH / 2;
  const wx0 = -d.h * HX - HX, wx1 = d.w * HX + HX, wy0 = -90, wy1 = (d.w + d.h) * HY + HY;
  const z = Math.min(W / (wx1 - wx0), (H - 30) / (wy1 - wy0)) * e.zoom;
  const ox = (W - (wx1 - wx0) * z) / 2 - wx0 * z + e.pan.x, oy = (H - 30 - (wy1 - wy0) * z) / 2 - wy0 * z + e.pan.y;
  return { dpr, W, H, z, ox, oy, iso: true, HX, HY };
}
function tileAt(ctx, cv, cx, cy) {
  const G = geom(ctx, cv);
  if (!G.iso) return { x: Math.floor((cx - G.ox) / G.ts), y: Math.floor((cy - G.oy) / G.ts) };
  const wx = (cx - G.ox) / G.z, wy = (cy - G.oy) / G.z;
  const fx = (wx / G.HX + wy / G.HY) / 2, fy = (wy / G.HY - wx / G.HX) / 2;
  return { x: Math.round(fx), y: Math.round(fy) };
}

function bind(ctx, cv) {
  const e = ed(ctx);
  const pts = new Map();
  let stroke = null, gesture = null;
  const pos = (ev) => { const r = cv.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
  const hint = (txt) => { const h = document.getElementById('edhint'); if (h) h.textContent = txt; };
  cv.addEventListener('contextmenu', (ev) => ev.preventDefault());
  cv.addEventListener('pointerdown', (ev) => {
    cv.setPointerCapture(ev.pointerId);
    pts.set(ev.pointerId, pos(ev));
    if (pts.size === 2) {
      // second finger: undo the stroke the first finger started, then pan/zoom
      if (stroke && stroke.did) { e.doc = JSON.parse(e.undo.pop()); changed(e); }
      stroke = null;
      const [a, b] = [...pts.values()];
      gesture = { d0: Math.hypot(a.x - b.x, a.y - b.y), z0: e.zoom, c0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, p0: { ...e.pan } };
      return;
    }
    if (ev.button === 1 || ev.button === 2 || ev.shiftKey && ev.pointerType === 'mouse' && false) { gesture = { mouse: 1, s: pos(ev), p0: { ...e.pan } }; return; }
    const p = pos(ev), t = tileAt(ctx, cv, p.x, p.y);
    stroke = { start: t, last: t, did: false };
    if (e.tool === 'room') { e.drag = { a: t, b: t }; draw(ctx); return; }
    snapshot(e);
    stroke.did = applyTool(ctx, t.x, t.y, true);
    if (!stroke.did) e.undo.pop(); else { changed(e); }
    draw(ctx);
  });
  cv.addEventListener('pointermove', (ev) => {
    const p = pos(ev);
    if (pts.has(ev.pointerId)) pts.set(ev.pointerId, p);
    if (gesture && gesture.mouse) { e.pan = { x: gesture.p0.x + p.x - gesture.s.x, y: gesture.p0.y + p.y - gesture.s.y }; draw(ctx); return; }
    if (gesture && pts.size >= 2) {
      const [a, b] = [...pts.values()];
      const dd = Math.hypot(a.x - b.x, a.y - b.y), c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      e.zoom = Math.max(0.6, Math.min(4, gesture.z0 * dd / Math.max(20, gesture.d0)));
      e.pan = { x: gesture.p0.x + c.x - gesture.c0.x, y: gesture.p0.y + c.y - gesture.c0.y };
      draw(ctx); return;
    }
    const t = tileAt(ctx, cv, p.x, p.y);
    if (!e.hover || e.hover.x !== t.x || e.hover.y !== t.y) {
      e.hover = t;
      const d = e.doc;
      if (inside(d, t.x, t.y)) {
        const o = objAt(d, t.x, t.y), pr = PROPS[d.props[t.y][t.x]];
        hint(`${t.x},${t.y} · ${GROUND[d.ground[t.y][t.x]].label}${o ? ' · ' + (o.k === 'container' ? `${o.stack === 2 ? 'double ' : ''}container ×${o.len}` : o.k) : pr ? ' · ' + pr.label : ''}${d.spawn[t.y][t.x] !== '.' ? (d.spawn[t.y][t.x] === 'P' ? ' · your spawn' : ' · enemy spawn') : ''}`);
      } else hint('');
      if (!stroke) draw(ctx);
    }
    if (!stroke) return;
    if (e.tool === 'room') { e.drag.b = t; draw(ctx); return; }
    if (!DRAG_TOOLS(e.tool) || (t.x === stroke.last.x && t.y === stroke.last.y)) return;
    // fill the gap between samples so fast drags don't skip tiles
    const n = Math.max(Math.abs(t.x - stroke.last.x), Math.abs(t.y - stroke.last.y));
    if (!stroke.did) snapshot(e);
    let any = false;
    for (let i = 1; i <= n; i++) {
      const x = Math.round(stroke.last.x + (t.x - stroke.last.x) * i / n), y = Math.round(stroke.last.y + (t.y - stroke.last.y) * i / n);
      any = applyTool(ctx, x, y, false) || any;
    }
    if (any) { stroke.did = true; changed(e); } else if (!stroke.did) e.undo.pop();
    stroke.last = t;
    draw(ctx);
  });
  const end = (ev) => {
    pts.delete(ev.pointerId);
    if (gesture) { if (pts.size === 0) gesture = null; return; }
    if (stroke && e.tool === 'room' && e.drag) {
      snapshot(e);
      if (placeRoom(ctx, e.drag.a, e.drag.b)) changed(e); else e.undo.pop();
      e.drag = null;
    }
    if (stroke) { stroke = null; ctx.render(); }
  };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
  cv.addEventListener('pointerleave', () => { if (!stroke) { e.hover = null; draw(ctx); } });
  cv.addEventListener('wheel', (ev) => { ev.preventDefault(); e.zoom = Math.max(0.6, Math.min(4, e.zoom * (ev.deltaY < 0 ? 1.12 : 1 / 1.12))); draw(ctx); }, { passive: false });
}

function draw(ctx) {
  const cv = document.getElementById('edcv');
  if (!cv) return;
  const e = ed(ctx);
  const G = geom(ctx, cv);
  const g = cv.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#121315'; g.fillRect(0, 0, cv.width, cv.height);
  g.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
  if (G.iso) drawIso(ctx, g, G); else drawTop(ctx, g, G);
}

function drawTop(ctx, g, G) {
  const e = ed(ctx), d = e.doc, ts = G.ts;
  const X = (x) => G.ox + x * ts, Y = (y) => G.oy + y * ts;
  const GCOL = { '.': '#4a4844', '~': '#163a48', '=': '#6a675f', s: '#3a3c3b', o: '#5a636a', r: '#5a3f35' };
  for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
    g.fillStyle = GCOL[d.ground[y][x]] || '#444';
    g.fillRect(X(x), Y(y), ts + 0.5, ts + 0.5);
    if (d.ground[y][x] === 'r' && ts > 10) { g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(X(x), Y(y), ts / 2, ts / 2); g.fillRect(X(x) + ts / 2, Y(y) + ts / 2, ts / 2, ts / 2); }
  }
  // spawns under everything
  for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
    const c = d.spawn[y][x];
    if (c === '.') continue;
    g.fillStyle = c === 'P' ? 'rgba(77,143,224,0.45)' : 'rgba(224,64,52,0.45)';
    g.fillRect(X(x) + 1, Y(y) + 1, ts - 2, ts - 2);
    if (ts > 12) { g.fillStyle = c === 'P' ? '#bcd8ff' : '#ffc0b8'; g.font = `bold ${Math.round(ts * 0.42)}px Inter, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(c === 'P' ? 'YOU' : 'FOE', X(x) + ts / 2, Y(y) + ts / 2); }
  }
  // grid
  g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 1;
  g.beginPath();
  for (let x = 0; x <= d.w; x++) { g.moveTo(X(x) + 0.5, Y(0)); g.lineTo(X(x) + 0.5, Y(d.h)); }
  for (let y = 0; y <= d.h; y++) { g.moveTo(X(0), Y(y) + 0.5); g.lineTo(X(d.w), Y(y) + 0.5); }
  g.stroke();
  // objects
  for (const o of d.objects) {
    const cells = objectTiles(o);
    const [ax, ay] = cells[0], [bx, by] = cells[cells.length - 1];
    const x0 = X(Math.min(ax, bx)) + ts * 0.08, y0 = Y(Math.min(ay, by)) + ts * 0.08;
    const w = (Math.abs(bx - ax) + 1) * ts - ts * 0.16, h = (Math.abs(by - ay) + 1) * ts - ts * 0.16;
    if (o.k === 'container') {
      g.fillStyle = SWATCH[o.hue] || '#666'; g.fillRect(x0, y0, w, h);
      g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = Math.max(1, ts * 0.06); g.strokeRect(x0, y0, w, h);
      g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 1;
      const along = o.dir === 'S';
      for (let k = 1; k < o.len * 4; k++) { g.beginPath(); if (along) { g.moveTo(x0, y0 + h * k / (o.len * 4)); g.lineTo(x0 + w, y0 + h * k / (o.len * 4)); } else { g.moveTo(x0 + w * k / (o.len * 4), y0); g.lineTo(x0 + w * k / (o.len * 4), y0 + h); } g.stroke(); }
      if (o.stack === 2) { g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x0 + 2, y0 + 2, Math.min(w, ts) * 0.5, ts * 0.36); g.fillStyle = '#fff'; g.font = `bold ${Math.round(ts * 0.3)}px Inter, sans-serif`; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText('×2', x0 + 4, y0 + 3); }
    } else if (o.k === 'van') {
      g.fillStyle = o.hue === 'grey' ? '#6c7077' : '#d8d2c6'; g.fillRect(x0, y0, w, h);
      g.fillStyle = '#2a3440';
      if (o.dir === 'S') g.fillRect(x0 + w * 0.15, y0 + h - ts * 0.5, w * 0.7, ts * 0.25); else g.fillRect(x0 + w - ts * 0.5, y0 + h * 0.15, ts * 0.25, h * 0.7);
    } else if (o.k === 'boat') {
      g.fillStyle = '#8a4a2a'; g.beginPath(); g.ellipse(x0 + w / 2, y0 + h / 2, w * 0.45, h * 0.32, 0, 0, Math.PI * 2); g.fill();
    }
  }
  // props
  for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
    const c = d.props[y][x];
    if (c === '.') continue;
    topProp(g, c, X(x), Y(y), ts);
  }
  // validation overlay: sealed tiles
  const v = e.check || (e.check = validateMap(d));
  if (v.stats && v.stats.sealedTiles) {
    g.strokeStyle = 'rgba(255,80,60,0.55)'; g.lineWidth = 1;
    for (const p of v.stats.sealedTiles) { g.beginPath(); g.moveTo(X(p.x), Y(p.y) + ts); g.lineTo(X(p.x) + ts, Y(p.y)); g.stroke(); }
  }
  // hover + room drag
  if (e.drag) {
    const x0 = Math.min(e.drag.a.x, e.drag.b.x), y0 = Math.min(e.drag.a.y, e.drag.b.y);
    g.strokeStyle = '#f0d060'; g.lineWidth = 2; g.setLineDash([5, 4]);
    g.strokeRect(X(x0), Y(y0), (Math.abs(e.drag.a.x - e.drag.b.x) + 1) * ts, (Math.abs(e.drag.a.y - e.drag.b.y) + 1) * ts);
    g.setLineDash([]);
  } else if (e.hover && inside(d, e.hover.x, e.hover.y)) {
    g.strokeStyle = '#f0d060'; g.lineWidth = 2;
    const preview = ghost(e);
    for (const [a, b] of preview) if (inside(d, a, b)) g.strokeRect(X(a) + 1, Y(b) + 1, ts - 2, ts - 2);
  }
}
function ghost(e) {
  const h = e.hover;
  if (e.tool === 'c1' || e.tool === 'c2') return objectTiles({ k: 'container', x: h.x, y: h.y, len: e.len, dir: e.dir });
  if (e.tool === 'van') return objectTiles({ k: 'van', x: h.x, y: h.y, dir: e.dir });
  return [[h.x, h.y]];
}
function topProp(g, c, x, y, ts) {
  const cx = x + ts / 2, cy = y + ts / 2, r = ts * 0.32;
  g.lineWidth = Math.max(1, ts * 0.08);
  switch (c) {
    case 'x': g.fillStyle = '#8a6a3e'; g.fillRect(x + ts * 0.18, y + ts * 0.18, ts * 0.64, ts * 0.64); g.strokeStyle = '#4a3820'; g.strokeRect(x + ts * 0.18, y + ts * 0.18, ts * 0.64, ts * 0.64); g.beginPath(); g.moveTo(x + ts * 0.18, y + ts * 0.18); g.lineTo(x + ts * 0.82, y + ts * 0.82); g.stroke(); break;
    case 'b': g.fillStyle = '#c0281e'; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill(); g.fillStyle = '#e8c23a'; g.beginPath(); g.arc(cx, cy, r * 0.35, 0, 7); g.fill(); break;
    case 'f': g.fillStyle = '#5a3a26'; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill(); g.fillStyle = '#ff9a3a'; g.beginPath(); g.arc(cx, cy, r * 0.55, 0, 7); g.fill(); break;
    case 'B': g.fillStyle = '#9a978f'; g.fillRect(x + ts * 0.08, y + ts * 0.34, ts * 0.84, ts * 0.32); g.fillStyle = '#d2aa28'; for (let k = 0; k < 3; k++) g.fillRect(x + ts * (0.14 + k * 0.28), y + ts * 0.34, ts * 0.12, ts * 0.32); break;
    case 'l': g.fillStyle = '#ffd27a'; g.beginPath(); g.arc(cx, cy, r * 0.5, 0, 7); g.fill(); g.strokeStyle = 'rgba(255,210,122,0.4)'; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.stroke(); break;
    case 'n': g.strokeStyle = '#a8b0b4'; g.setLineDash([3, 2]); g.beginPath(); g.moveTo(x, cy); g.lineTo(x + ts, cy); g.moveTo(cx, y); g.lineTo(cx, y + ts); g.stroke(); g.setLineDash([]); break;
    case 'W': case 'w': g.fillStyle = c === 'W' ? '#20262c' : '#3a4650'; g.fillRect(x + 1, y + 1, ts - 2, ts - 2); if (c === 'w') { g.strokeStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.moveTo(x + 2, y + ts - 2); g.lineTo(x + ts - 2, y + 2); g.stroke(); } break;
    case 'D': case 'd': g.strokeStyle = '#e0c15a'; g.beginPath(); g.arc(x + ts * 0.15, y + ts * 0.85, ts * 0.65, -Math.PI / 2, 0); g.stroke(); break;
    case 'k': g.fillStyle = '#6a4a30'; g.fillRect(x + ts * 0.12, y + ts * 0.3, ts * 0.76, ts * 0.4); break;
    case 'h': g.fillStyle = '#4a5560'; g.fillRect(x + ts * 0.12, y + ts * 0.18, ts * 0.76, ts * 0.22); g.fillRect(x + ts * 0.12, y + ts * 0.6, ts * 0.76, ts * 0.22); break;
    case 'p': g.fillStyle = '#5a3a26'; g.fillRect(x + ts * 0.2, y + ts * 0.2, ts * 0.6, ts * 0.6); break;
    default: break;
  }
}

function drawIso(ctx, g, G) {
  const e = ed(ctx), d = e.doc, z = G.z;
  if (!e.map) { try { e.map = mapFromJson(d); } catch { return; } }
  const m = e.map;
  const now = performance.now();
  g.save();
  g.translate(G.ox, G.oy);
  Dock.prepMap(m);
  Dock.drawYard(g, m, z, now);
  Dock.drawBackdrop(g, m, z, now);
  const sp = [];
  for (const s of Dock.sceneryOf(m)) if (s.depth < 0) Dock.drawScenery(g, s, z, now); else sp.push({ depth: s.depth, s });
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const t = m.tiles[y][x];
    if (!t.decor || Dock.skipPairedEast(t)) continue;
    sp.push({ depth: x + y + (Dock.isPairedWest(t) ? 0.5 : 0), x, y, t });
  }
  // spawn markers on the ground
  const HX = G.HX, HY = G.HY;
  const dia = (x, y, fill, stroke) => {
    const p = Dock.toWorld(x, y);
    g.beginPath(); g.moveTo(p.x * z, (p.y - HY) * z); g.lineTo((p.x + HX) * z, p.y * z); g.lineTo(p.x * z, (p.y + HY) * z); g.lineTo((p.x - HX) * z, p.y * z); g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1.5; g.stroke(); }
  };
  for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
    const c = d.spawn[y][x];
    if (c !== '.') dia(x, y, c === 'P' ? 'rgba(77,143,224,0.45)' : 'rgba(224,64,52,0.45)', c === 'P' ? '#8fc0ff' : '#ff8a7a');
  }
  sp.sort((a, b) => a.depth - b.depth);
  for (const it of sp) {
    if (it.s) { Dock.drawScenery(g, it.s, z, now); continue; }
    const p = Dock.toWorld(it.x, it.y);
    // fade tall props near the cursor so you can see what's behind
    const near = e.hover && (it.x + it.y) > (e.hover.x + e.hover.y) && (it.x + it.y) - (e.hover.x + e.hover.y) < 4 && Math.abs((it.x - it.y) - (e.hover.x - e.hover.y)) < 2;
    g.save(); if (near && Dock.isTall(it.t)) g.globalAlpha = 0.35;
    Dock.drawProp(g, it.t, p.x * z, p.y * z, z, now);
    g.restore();
  }
  if (e.hover && inside(d, e.hover.x, e.hover.y)) for (const [a, b] of ghost(e)) if (inside(d, a, b)) dia(a, b, 'rgba(240,208,96,0.18)', '#f0d060');
  g.restore();
}

// ---------- menus ----------
function menuHtml(ctx) {
  const maps = listMaps();
  return `<div class="edmenu">
    <div class="h" style="font-size:20px">Battle maps</div>
    <div class="row" style="gap:6px;flex-wrap:wrap;margin:8px 0">
      ${Object.entries(MAP_SIZES).map(([k, [w, h]]) => `<button class="btn sm" data-act="edNew" data-size="${k}">New ${k} ${w}×${h}</button>`).join('')}
      <button class="btn sm" data-act="edFromDocklands">Copy Docklands</button>
    </div>
    <div class="edlist">
      ${maps.length ? maps.map((j) => { const v = validateMap(j); return `<div class="edli"><b>${esc(j.name)}</b><span class="tiny dim">${j.w}×${j.h} · ${v.ok ? 'playable' : 'needs fixing'}</span>
        <span class="grow"></span><button class="btn sm" data-act="edOpen" data-id="${esc(j.id)}">Edit</button>
        <button class="btn sm red" data-act="edPlayId" data-id="${esc(j.id)}" ${v.ok ? '' : 'disabled'}>Play</button>
        <button class="btn sm" data-act="edDelete" data-id="${esc(j.id)}">🗑</button></div>`; }).join('') : '<div class="tiny dim">No saved maps yet. Build one and press Save.</div>'}
    </div>
    <div class="row" style="gap:6px;margin-top:10px;flex-wrap:wrap">
      <button class="btn sm" data-act="edExport">Export JSON</button>
      <label class="btn sm">Import file<input type="file" accept=".json,application/json" id="edfile" hidden></label>
      <button class="btn sm" data-act="edPaste">Paste JSON</button>
    </div>
  </div>`;
}
function issuesHtml(v) {
  return `<div class="edmenu"><div class="h" style="font-size:20px">${v.ok ? 'Map check' : "Can't play this map yet"}</div>
    ${v.errors.map((x) => `<p class="small" style="color:#ff8a7a">✕ ${esc(x)}</p>`).join('')}
    ${v.warnings.map((x) => `<p class="small" style="color:#e0c15a">⚠ ${esc(x)}</p>`).join('')}
    ${v.ok && !v.warnings.length ? '<p class="small green">✓ Spawns connected, enough spawn tiles, cover is balanced, no sealed-off areas.</p>' : ''}
    <p class="tiny dim">Cover points: your half ${Math.round(v.stats.coverP || 0)} · enemy half ${Math.round(v.stats.coverE || 0)}</p>
    <button class="btn block" data-act="closeModal">OK</button></div>`;
}
function play(ctx, json) {
  const v = validateMap(json);
  if (!v.ok) { ctx.modal(issuesHtml(v), { center: true }); return; }
  ctx.closeModal();
  ctx.state.tactics = startCustom(ctx.state, json, (Date.now() >>> 0));
  ctx.sub.tactics = null;
  ctx.sub.afterBattle = 'editor';
  ctx.go('tactics');
}

export const actions = {
  edTool(ctx, el) { const e = ed(ctx); e.tool = el.dataset.tool; ctx.render(); },
  edLen(ctx, el) { ed(ctx).len = +el.dataset.v; ctx.render(); },
  edHue(ctx, el) { ed(ctx).hue = el.dataset.v; ctx.render(); },
  edVanHue(ctx, el) { ed(ctx).vanHue = el.dataset.v; ctx.render(); },
  edRoomHue(ctx, el) { ed(ctx).roomHue = el.dataset.v; ctx.render(); },
  edDir(ctx) { const e = ed(ctx); e.dir = e.dir === 'E' ? 'S' : 'E'; ctx.render(); },
  edView(ctx) { const e = ed(ctx); e.view = e.view === 'top' ? 'iso' : 'top'; e.zoom = 1; e.pan = { x: 0, y: 0 }; ctx.render(); },
  edZoom(ctx, el) { const e = ed(ctx); const k = +el.dataset.z; if (!k) { e.zoom = 1; e.pan = { x: 0, y: 0 }; } else e.zoom = Math.max(0.6, Math.min(4, e.zoom * (k > 0 ? 1.25 : 0.8))); draw(ctx); },
  edUndo(ctx) { const e = ed(ctx); if (!e.undo.length) return; e.redo.push(JSON.stringify(e.doc)); e.doc = JSON.parse(e.undo.pop()); changed(e); ctx.render(); },
  edRedo(ctx) { const e = ed(ctx); if (!e.redo.length) return; e.undo.push(JSON.stringify(e.doc)); e.doc = JSON.parse(e.redo.pop()); changed(e); ctx.render(); },
  edSize(ctx, el) {
    const e = ed(ctx), k = el.value;
    if (!MAP_SIZES[k]) return;
    snapshot(e); resize(e, k); changed(e); e.zoom = 1; e.pan = { x: 0, y: 0 }; ctx.render();
  },
  edSave(ctx) {
    const e = ed(ctx);
    const j = saveMap(e.doc);
    e.doc.id = j.id; e.saved = true;
    ctx.toast(`Saved “${j.name}”.`);
    ctx.render();
  },
  edPlay(ctx) { const e = ed(ctx); if (validateMap(e.doc).ok) { saveMap(e.doc); e.saved = true; } play(ctx, e.doc); },
  edPlayId(ctx, el) { const j = getMap(el.dataset.id); if (j) { loadDoc(ed(ctx), j); play(ctx, j); } },
  edIssues(ctx) { ctx.modal(issuesHtml(validateMap(ed(ctx).doc)), { center: true }); },
  edExit(ctx) { ctx.go(ctx.sub.editorBack || 'heroes'); },
  edMenu(ctx) {
    const el = ctx.modal(menuHtml(ctx), { center: true });
    const f = el.querySelector('#edfile');
    if (f) f.addEventListener('change', async () => { const file = f.files[0]; if (!file) return; importText(ctx, await file.text()); });
  },
  edNew(ctx, el) { const e = ed(ctx); snapshot(e); const d = normalizeMapJson(blankMapJson(el.dataset.size, 'My map')); d.spawn = defaultSpawns(d); e.doc = d; e.saved = false; changed(e); e.undo = []; ctx.closeModal(); ctx.render(); },
  edFromDocklands(ctx) { loadDoc(ed(ctx), { ...DOCKLANDS, id: 'map-' + Date.now().toString(36), name: 'Docklands copy', seats: undefined, flavour: undefined }); ed(ctx).saved = false; ctx.closeModal(); ctx.render(); },
  edOpen(ctx, el) { const j = getMap(el.dataset.id); if (j) loadDoc(ed(ctx), j); ctx.closeModal(); ctx.render(); },
  edDelete(ctx, el) { deleteMap(el.dataset.id); actions.edMenu(ctx); },
  edExport(ctx) {
    const e = ed(ctx);
    const txt = stringifyMap(normalizeMapJson(e.doc));
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([txt], { type: 'application/json' }));
      a.download = (e.doc.name || 'map').replace(/[^\w-]+/g, '_') + '.json';
      document.body.appendChild(a); a.click(); a.remove();
    } catch { /* fall through to the copy box */ }
    ctx.modal(`<div class="edmenu"><div class="h" style="font-size:20px">Map JSON</div><p class="tiny dim">Downloaded as a file. You can also copy it from here.</p><textarea class="edjson" readonly>${esc(txt)}</textarea><button class="btn block" data-act="closeModal">Done</button></div>`, { center: true });
  },
  edPaste(ctx) {
    ctx.modal(`<div class="edmenu"><div class="h" style="font-size:20px">Paste map JSON</div><textarea class="edjson" id="edpaste" placeholder='{"format":"fang-city-map", ...}'></textarea><button class="btn red block" data-act="edPasteGo">Load</button></div>`, { center: true });
  },
  edPasteGo(ctx) { const t = document.getElementById('edpaste'); if (t) importText(ctx, t.value); },
};
function importText(ctx, txt) {
  try {
    const j = normalizeMapJson(txt);
    if (!j.id || j.id === 'docklands' || listMaps().some((m) => m.id === j.id)) { j.id = 'map-' + Date.now().toString(36); delete j.seats; }
    const e = ed(ctx); snapshot(e);
    loadDoc(e, j); e.saved = false;
    ctx.closeModal(); ctx.toast(`Loaded “${j.name}”.`); ctx.render();
  } catch (err) { ctx.toast(`Couldn't load that map: ${err.message}`); }
}
