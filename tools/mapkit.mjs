// Tiny builder for hand-authored battle maps (used by tools/build-maps.mjs). Produces v2 map JSON.
import { MAP_FORMAT, MAP_VERSION, MAP_SIZES } from '../js/core/mapfmt.js';
import { THEMES, PROP, ROOM_STYLES } from '../js/core/catalog.js';

export class MapKit {
  constructor({ id, name, theme, size = 'medium', env, notes = '' }) {
    const [w, h] = MAP_SIZES[size];
    Object.assign(this, { id, name, theme, w, h, notes });
    this.env = { ...THEMES[theme].env, ...(env || {}) };
    const row = (c) => Array.from({ length: h }, () => c.repeat(w).split(''));
    this.G = row(THEMES[theme].ground); this.Pr = row('.'); this.S = row('.');
    this.objects = [];
  }
  in(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  ground(ch, x0, y0, x1 = x0, y1 = y0) { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) if (this.in(x, y)) this.G[y][x] = ch; return this; }
  prop(ch, x, y) { if (this.in(x, y)) this.Pr[y][x] = ch; return this; }
  props(ch, list) { for (const [x, y] of list) this.prop(ch, x, y); return this; }
  obj(k, x, y, o = {}) { this.objects.push({ k, x, y, ...(PROP[k].rot ? { dir: o.dir || 'E' } : {}), hue: o.hue || '', ...(k === 'container' ? { len: o.len || 1, stack: o.stack || 1 } : {}) }); return this; }
  // point-mirrored copy (x,y) -> (w-1-x, h-1-y), so both halves get the same cover
  mx(x, y, k, o = {}) {
    const n = k === 'container' ? (o.len || 1) : (k && PROP[k] ? PROP[k].size : 1);
    const S = o.dir === 'S';
    return [this.w - 1 - x - (S ? 0 : n - 1), this.h - 1 - y - (S ? n - 1 : 0)];
  }
  sym(k, x, y, o = {}) { this.obj(k, x, y, o); const [a, b] = this.mx(x, y, k, o); this.obj(k, a, b, o.hue2 ? { ...o, hue: o.hue2 } : o); return this; }
  symProp(ch, list) { for (const [x, y] of list) { this.prop(ch, x, y); this.prop(ch, this.w - 1 - x, this.h - 1 - y); } return this; }
  room(style, x0, y0, x1, y1, { doors = [], open = [] } = {}) {
    const fl = ROOM_STYLES[style].ch;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      this.Pr[y][x] = '.';
      if (x > x0 && x < x1 && y > y0 && y < y1) this.G[y][x] = fl;
      else this.Pr[y][x] = (y === y1 || x === x1) ? 'w' : 'W';
    }
    for (const [x, y] of doors) { const front = y === y1 || x === x1; this.Pr[y][x] = front ? 'd' : 'D'; this.G[y][x] = fl; }
    for (const [x, y] of open) { this.Pr[y][x] = '.'; this.G[y][x] = fl; }
    return this;
  }
  spawn(side, x0, y0, x1, y1) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.S[y][x] = side; return this; }
  // every object tile must be free (no other object, no layer prop, no water unless the prop allows it)
  problems() {
    const out = [], used = new Map();
    for (const o of this.objects) {
      const d = PROP[o.k], n = o.k === 'container' ? o.len : d.size;
      for (let i = 0; i < n; i++) {
        const x = o.dir === 'S' ? o.x : o.x + i, y = o.dir === 'S' ? o.y + i : o.y;
        const at = `${x},${y}`;
        if (!this.in(x, y)) out.push(`${o.k} off map at ${at}`);
        else {
          if (used.has(at)) out.push(`${o.k} overlaps ${used.get(at)} at ${at}`);
          if (this.Pr[y][x] !== '.') out.push(`${o.k} sits on prop '${this.Pr[y][x]}' at ${at}`);
          if (this.S[y][x] !== '.' && d.block !== 0) out.push(`${o.k} sits on a spawn at ${at}`);
          const wet = this.G[y][x] === '~', w = d.water || 'land';
          if ((w === 'land' && wet) || (w === 'water' && !wet)) out.push(`${o.k} on wrong ground at ${at}`);
        }
        used.set(at, o.k);
      }
    }
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.Pr[y][x] !== '.' && this.G[y][x] === '~') out.push(`prop on water at ${x},${y}`);
    return out;
  }
  json() {
    return {
      format: MAP_FORMAT, version: MAP_VERSION, id: this.id, name: this.name, w: this.w, h: this.h,
      theme: this.theme, env: this.env,
      ground: this.G.map((r) => r.join('')), props: this.Pr.map((r) => r.join('')), spawn: this.S.map((r) => r.join('')),
      objects: this.objects, notes: this.notes, builtin: 1,
    };
  }
}
