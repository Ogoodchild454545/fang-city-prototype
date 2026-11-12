// Hand-painted isometric docklands yard. Flat map: stacks and stairs are scenery,
// not climbable high ground. Drawn in canvas (no third-party tilesets).
export const TW = 58, TH = 29;

export function toWorld(x, y) {
  return { x: (x - y) * (TW / 2), y: (x + y) * (TH / 2) };
}

function diamond(g, x, y, z, fill, stroke, lw) {
  const w = TW * z, h = TH * z;
  g.beginPath();
  g.moveTo(x, y - h / 2);
  g.lineTo(x + w / 2, y);
  g.lineTo(x, y + h / 2);
  g.lineTo(x - w / 2, y);
  g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || Math.max(0.8, z); g.stroke(); }
}

function facePts(cx, cy, z, H) {
  const w = (TW / 2) * z, t = (TH / 2) * z;
  return {
    gt: [cx, cy - t], gr: [cx + w, cy], gb: [cx, cy + t], gl: [cx - w, cy],
    tt: [cx, cy - t - H], tr: [cx + w, cy - H], tb: [cx, cy + t - H], tl: [cx - w, cy - H],
  };
}

function poly(g, pts, fill, stroke, lw) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 1; g.stroke(); }
}

function isoBox(g, cx, cy, z, H, pal) {
  const p = facePts(cx, cy, z, H);
  poly(g, [p.gl, p.gb, p.tb, p.tl], pal.left, pal.edge, z);
  poly(g, [p.gr, p.gb, p.tb, p.tr], pal.right, pal.edge, z);
  poly(g, [p.tt, p.tr, p.tb, p.tl], pal.top, pal.edge, z);
  return p;
}

function ribs(g, p, n, left, color, z) {
  g.strokeStyle = color;
  g.lineWidth = Math.max(0.7, 0.8 * z);
  for (let i = 1; i < n; i++) {
    const k = i / n;
    if (left) {
      const ax = p.gl[0] + (p.gb[0] - p.gl[0]) * k;
      const ay = p.gl[1] + (p.gb[1] - p.gl[1]) * k;
      const bx = p.tl[0] + (p.tb[0] - p.tl[0]) * k;
      const by = p.tl[1] + (p.tb[1] - p.tl[1]) * k;
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
    } else {
      const ax = p.gr[0] + (p.gb[0] - p.gr[0]) * k;
      const ay = p.gr[1] + (p.gb[1] - p.gr[1]) * k;
      const bx = p.tr[0] + (p.tb[0] - p.tr[0]) * k;
      const by = p.tr[1] + (p.tb[1] - p.tr[1]) * k;
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
    }
  }
}

function shadeGround(g, x, y, z, a, b) {
  const w = TW * z, h = TH * z;
  const grd = g.createLinearGradient(x, y - h / 2, x, y + h / 2);
  grd.addColorStop(0, a);
  grd.addColorStop(1, b);
  diamond(g, x, y, z, grd, 'rgba(0,0,0,0.28)');
}

export function drawSky(g, w, h) {
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#1a1220');
  sky.addColorStop(0.32, '#6a3a48');
  sky.addColorStop(0.55, '#c46a42');
  sky.addColorStop(0.72, '#8a5a4a');
  sky.addColorStop(1, '#2a2420');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  // low sun glow
  const sun = g.createRadialGradient(w * 0.72, h * 0.28, 4, w * 0.72, h * 0.28, w * 0.45);
  sun.addColorStop(0, 'rgba(255,190,110,0.55)');
  sun.addColorStop(0.4, 'rgba(200,80,50,0.12)');
  sun.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = sun;
  g.fillRect(0, 0, w, h);
}

export function groundFill(t, x, y, parity) {
  if (t.t === 'water') return parity ? '#0a2a32' : '#0d333c';
  if (t.t === 'edge') return parity ? '#4a4e52' : '#42464a';
  if (t.t === 'shed') return parity ? '#3a4a4c' : '#334244';
  if (t.t === 'interior' || t.t === 'door') {
    return t.hue === 'cafe' || t.hue === '' && t.t === 'interior'
      ? (parity ? '#5a3a2c' : '#523628')
      : (parity ? '#4a4238' : '#433c34');
  }
  return parity ? '#5a5650' : '#524e48';
}

export function drawGround(g, t, sx, sy, z, parity) {
  const fill = groundFill(t, t && t.t, t && t.y, parity);
  if (t.t === 'water') {
    const wcol = g.createLinearGradient(sx, sy - TH * z / 2, sx, sy + TH * z / 2);
    wcol.addColorStop(0, parity ? '#163a44' : '#1a424c');
    wcol.addColorStop(0.5, '#0c2a32');
    wcol.addColorStop(1, '#081c22');
    diamond(g, sx, sy, z, wcol, 'rgba(20,60,70,0.5)');
    // ripples + dusk reflection
    g.save();
    g.globalAlpha = 0.28;
    g.strokeStyle = '#3a7a88';
    g.lineWidth = 0.8 * z;
    g.beginPath();
    g.ellipse(sx, sy, 10 * z, 4 * z, 0, 0, Math.PI * 2);
    g.stroke();
    g.globalAlpha = 0.18;
    g.strokeStyle = '#e8a070';
    g.beginPath();
    g.ellipse(sx + 4 * z, sy - 2 * z, 7 * z, 2.5 * z, 0, 0, Math.PI);
    g.stroke();
    g.restore();
    return;
  }
  shadeGround(g, sx, sy, z, fill, shift(fill, -12));
  // wet sheen on the yard
  if (t.t === 'yard' || t.t === 'edge' || t.t === 'shed') {
    g.save();
    g.globalAlpha = 0.12;
    const w = TW * z, h = TH * z;
    g.beginPath();
    g.moveTo(sx, sy - h / 2);
    g.lineTo(sx + w / 2, sy);
    g.lineTo(sx, sy);
    g.closePath();
    g.fillStyle = '#d8c4a0';
    g.fill();
    g.restore();
  }
  if (t.t === 'edge') {
    // quay lip
    g.strokeStyle = 'rgba(180,160,120,0.45)';
    g.lineWidth = 1.4 * z;
    const w = TW * z, h = TH * z;
    g.beginPath();
    g.moveTo(sx - w / 2, sy);
    g.lineTo(sx, sy + h / 2);
    g.stroke();
  }
  if (t.t === 'interior' || t.t === 'door') {
    // warm floor boards
    g.save();
    g.globalAlpha = 0.2;
    g.strokeStyle = '#e8c090';
    g.lineWidth = 0.7 * z;
    for (let i = -2; i <= 2; i++) {
      g.beginPath();
      g.moveTo(sx - 10 * z + i * 5 * z, sy + 6 * z);
      g.lineTo(sx + 8 * z + i * 5 * z, sy - 6 * z);
      g.stroke();
    }
    g.restore();
  }
  if (t.t === 'shed') {
    // teal canopy wash
    g.save();
    g.globalAlpha = 0.16;
    diamond(g, sx, sy, z, '#2ad0c8', null);
    g.restore();
  }
}

function shift(hex, d) {
  if (!hex || hex[0] !== '#' || hex.length < 7) return hex;
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + d));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + d));
  const b = Math.max(0, Math.min(255, (n & 255) + d));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

function containerPal(hue) {
  if (hue === 'teal') {
    return { left: '#0e4a4c', right: '#0a3538', top: '#1a8a86', edge: '#062428', rib: 'rgba(180,230,220,0.28)', badge: '#d8c45a' };
  }
  return { left: '#7a2018', right: '#541410', top: '#b83328', edge: '#2a0a08', rib: 'rgba(255,200,180,0.22)', badge: '#d8c45a' };
}

export function isPairedWest(t) {
  return t && (t.decor === 'van' || t.decor === 'wreck' || t.decor === 'car');
}
export function skipPairedEast(t) {
  return t && (t.decor === 'van2' || t.decor === 'wreck2' || t.decor === 'car2');
}

export function propHeight(t) {
  if (!t || !t.decor) return 0;
  const d = t.decor;
  if (d === 'wall') return 36;
  if (d === 'container') return t.stack >= 2 ? 40 : 24;
  if (d === 'van' || d === 'van2' || d === 'wreck' || d === 'wreck2' || d === 'car' || d === 'car2') return 18;
  if (d === 'barrier') return 12;
  if (d === 'crate' || d === 'desk') return 10;
  if (d === 'barrel' || d === 'barrelWreck' || d === 'barrel-shelf') return 14;
  if (d === 'lamp') return 28;
  if (d === 'stairs') return 16;
  if (d === 'boat') return 14;
  if (d === 'door') return 28;
  return 0;
}

export function drawProp(g, t, sx, sy, z) {
  if (!t || !t.decor) return;
  const d = t.decor;
  if (skipPairedEast(t)) return;
  g.save();
  if (d === 'container') drawContainer(g, t, sx, sy, z);
  else if (d === 'van' || d === 'car') drawVan(g, t, sx, sy, z, false);
  else if (d === 'wreck') drawVan(g, t, sx, sy, z, true);
  else if (d === 'wall') drawWall(g, t, sx, sy, z);
  else if (d === 'door') drawDoor(g, t, sx, sy, z);
  else if (d === 'barrier') drawBarrier(g, sx, sy, z);
  else if (d === 'crate') drawCrate(g, sx, sy, z);
  else if (d === 'desk') drawDesk(g, sx, sy, z);
  else if (d === 'barrel') drawBarrel(g, sx, sy, z, false);
  else if (d === 'barrelWreck') drawBarrel(g, sx, sy, z, true);
  else if (d === 'barrel-shelf') drawShelf(g, sx, sy, z);
  else if (d === 'lamp') drawLamp(g, sx, sy, z);
  else if (d === 'stairs') drawStairs(g, sx, sy, z);
  else if (d === 'boat') drawBoat(g, t, sx, sy, z);
  g.restore();
}

function drawContainer(g, t, sx, sy, z) {
  const H = (t.stack >= 2 ? 40 : 24) * z;
  const pal = containerPal(t.hue);
  const p = isoBox(g, sx, sy, z, H, pal);
  ribs(g, p, 5, true, pal.rib, z);
  ribs(g, p, 5, false, pal.rib, z);
  // door crease on the right face
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 1.1 * z;
  const mx = (p.tr[0] + p.tb[0]) / 2, my = (p.tr[1] + p.tb[1]) / 2;
  const gx = (p.gr[0] + p.gb[0]) / 2, gy = (p.gr[1] + p.gb[1]) / 2;
  g.beginPath(); g.moveTo(mx, my); g.lineTo(gx, gy); g.stroke();
  // number plate
  g.fillStyle = pal.badge;
  const bx = (p.tl[0] + p.tb[0]) / 2, by = (p.tl[1] + p.tb[1]) / 2 + 4 * z;
  g.fillRect(bx - 5 * z, by - 3 * z, 10 * z, 4 * z);
  if (t.stack >= 2) {
    // rust streak
    g.strokeStyle = 'rgba(40,12,8,0.35)';
    g.beginPath();
    g.moveTo(p.tl[0] + 6 * z, p.tl[1] + 4 * z);
    g.lineTo(p.gl[0] + 6 * z, p.gl[1] - 2 * z);
    g.stroke();
  }
}

function drawVan(g, t, sx, sy, z, wreck) {
  // Two-tile body along +x. Anchor on the west tile, shift mid-way to +x.
  const mid = toWorld(0.5, 0);
  const cx = sx + mid.x * z, cy = sy + mid.y * z;
  const H = 16 * z;
  const pal = wreck
    ? { left: '#2a2420', right: '#1c1814', top: '#3a322c', edge: '#0a0806' }
    : t.hue === 'grey'
      ? { left: '#5a5e66', right: '#3e4248', top: '#8a8e96', edge: '#1a1c20' }
      : { left: '#d8d2c8', right: '#b0aaa0', top: '#efeae2', edge: '#4a4440' };
  // custom 2-tile box: stretch along x
  const w = (TW / 2) * z, tt = (TH / 2) * z;
  // corners of a 2x1 footprint
  const gl = [cx - w * 1.5, cy + tt * 0.15];
  const gb = [cx, cy + tt * 1.15];
  const gr = [cx + w * 1.5, cy + tt * 0.15];
  const gn = [cx, cy - tt * 0.85];
  const lift = (pts) => pts.map(([x, y]) => [x, y - H]);
  const [tl, tb, tr, tn] = lift([gl, gb, gr, gn]);
  poly(g, [gl, gb, tb, tl], pal.left, pal.edge, z);
  poly(g, [gr, gb, tb, tr], pal.right, pal.edge, z);
  poly(g, [tn, tr, tb, tl], pal.top, pal.edge, z);
  if (!wreck) {
    // windscreen on the +x cab
    g.fillStyle = '#7ec4d8';
    const wx = (tr[0] + tn[0]) / 2, wy = (tr[1] + tn[1]) / 2 + 3 * z;
    g.beginPath();
    g.moveTo(wx - 4 * z, wy);
    g.lineTo(wx + 5 * z, wy + 3 * z);
    g.lineTo(wx + 5 * z, wy + 8 * z);
    g.lineTo(wx - 4 * z, wy + 5 * z);
    g.closePath(); g.fill();
    g.fillStyle = t.hue === 'grey' ? '#2a2c30' : '#c0a030';
    g.fillRect((tl[0] + tn[0]) / 2 - 4 * z, (tl[1] + tn[1]) / 2 + 2 * z, 8 * z, 2 * z);
  } else {
    // scorch + ember
    g.fillStyle = 'rgba(20,10,6,0.55)';
    poly(g, [tn, tr, tb, tl], 'rgba(20,10,6,0.4)', null);
    g.fillStyle = '#3a2010';
    g.beginPath(); g.arc(cx, cy - H * 0.4, 4 * z, 0, Math.PI * 2); g.fill();
  }
}

function drawWall(g, t, sx, sy, z) {
  const cafe = t.hue === 'cafe';
  const pal = cafe
    ? { left: '#6a3a32', right: '#4e2a24', top: '#8a5a48', edge: '#2a1410' }
    : { left: '#8a7a66', right: '#6a5c4c', top: '#b0a090', edge: '#3a3228' };
  const H = 36 * z;
  const p = isoBox(g, sx, sy, z, H, pal);
  // lit windows
  const win = cafe ? '#f0b45a' : '#e8c86a';
  g.fillStyle = win;
  const placeWin = (ax, ay) => {
    g.fillRect(ax, ay, 5 * z, 6 * z);
    g.fillStyle = 'rgba(255,240,180,0.35)';
    g.fillRect(ax, ay, 5 * z, 2 * z);
    g.fillStyle = win;
  };
  placeWin((p.tl[0] + p.tb[0]) / 2 - 6 * z, (p.tl[1] + p.tb[1]) / 2 + 8 * z);
  placeWin((p.tr[0] + p.tb[0]) / 2 - 2 * z, (p.tr[1] + p.tb[1]) / 2 + 8 * z);
  // cornice
  g.fillStyle = cafe ? '#3a2018' : '#6a2a22';
  poly(g, [
    [p.tt[0], p.tt[1] - 3 * z], [p.tr[0], p.tr[1] - 3 * z], p.tr, p.tt,
  ], cafe ? '#4a281c' : '#8a3230', pal.edge, z);
}

function drawDoor(g, t, sx, sy, z) {
  const cafe = t.hue === 'cafe';
  const pal = cafe
    ? { left: '#6a3a32', right: '#4e2a24', top: '#8a5a48', edge: '#2a1410' }
    : { left: '#8a7a66', right: '#6a5c4c', top: '#b0a090', edge: '#3a3228' };
  const H = 28 * z;
  const p = isoBox(g, sx, sy, z, H, pal);
  // open doorway on the south face (bottom)
  g.fillStyle = cafe ? '#2a1810' : '#1a1814';
  const gap = [
    [p.tb[0] - 4 * z, p.tb[1] - 2 * z],
    [p.tb[0] + 4 * z, p.tb[1] - 2 * z],
    [p.gb[0] + 4 * z, p.gb[1] - 2 * z],
    [p.gb[0] - 4 * z, p.gb[1] - 2 * z],
  ];
  // cut a dark opening on the raised front
  g.fillStyle = cafe ? '#3a2014' : '#1c1810';
  g.fillRect(p.tb[0] - 5 * z, p.tb[1] + 4 * z, 10 * z, 16 * z);
  g.fillStyle = cafe ? '#e8a050' : '#d4c08a';
  g.globalAlpha = 0.35;
  g.fillRect(p.tb[0] - 4 * z, p.tb[1] + 5 * z, 8 * z, 8 * z);
  g.globalAlpha = 1;
}

function drawBarrier(g, sx, sy, z) {
  const H = 11 * z;
  const pal = { left: '#b8b2a6', right: '#8e887c', top: '#d0cac0', edge: '#4a463e' };
  const p = isoBox(g, sx, sy, z, H, pal);
  g.fillStyle = '#d0782a';
  const midy = (p.tl[1] + p.tr[1]) / 2 + 2 * z;
  g.beginPath();
  g.moveTo(p.tl[0] + 2 * z, midy);
  g.lineTo(p.tr[0] - 2 * z, midy);
  g.lineTo(p.tr[0] - 2 * z, midy + 3 * z);
  g.lineTo(p.tl[0] + 2 * z, midy + 3 * z);
  g.closePath(); g.fill();
}

function drawCrate(g, sx, sy, z) {
  const H = 10 * z;
  const pal = { left: '#8a6234', right: '#6a4a24', top: '#c49a5a', edge: '#3d2a14' };
  const p = isoBox(g, sx, sy, z, H, pal);
  g.strokeStyle = 'rgba(60,30,10,0.5)';
  g.lineWidth = 1 * z;
  g.beginPath();
  g.moveTo((p.tl[0] + p.tr[0]) / 2, (p.tl[1] + p.tr[1]) / 2);
  g.lineTo((p.tb[0]), p.tb[1]);
  g.stroke();
}

function drawDesk(g, sx, sy, z) {
  const H = 9 * z;
  isoBox(g, sx, sy, z, H, { left: '#5a3a24', right: '#3e2818', top: '#7a5638', edge: '#2a1810' });
  g.fillStyle = '#c4a060';
  g.fillRect(sx - 4 * z, sy - 14 * z, 3 * z, 6 * z); // lamp
  g.fillStyle = '#f0d080';
  g.beginPath(); g.arc(sx - 2.5 * z, sy - 15 * z, 3 * z, 0, Math.PI * 2); g.fill();
}

function drawBarrel(g, sx, sy, z, wreck) {
  const H = 13 * z;
  const pal = wreck
    ? { left: '#2a2018', right: '#1a1410', top: '#3a2e24', edge: '#0a0806' }
    : { left: '#8a2e18', right: '#5e1c10', top: '#c44a28', edge: '#2a0c08' };
  const p = isoBox(g, sx, sy * 1, z, H, pal);
  if (!wreck) {
    g.strokeStyle = 'rgba(255,200,160,0.3)';
    g.lineWidth = 1.2 * z;
    g.beginPath();
    g.moveTo(p.tl[0] + 2 * z, p.tl[1] + 5 * z);
    g.lineTo(p.tr[0] - 2 * z, p.tr[1] + 5 * z);
    g.stroke();
    // hazard hoop
    g.strokeStyle = '#e0c15a';
    g.beginPath();
    g.moveTo(p.tl[0] + 2 * z, p.tl[1] + 8 * z);
    g.lineTo(p.tr[0] - 2 * z, p.tr[1] + 8 * z);
    g.stroke();
  }
}

function drawShelf(g, sx, sy, z) {
  isoBox(g, sx, sy, z, 16 * z, { left: '#4a4038', right: '#322c28', top: '#6a6058', edge: '#1a1614' });
  g.fillStyle = '#7a2a18';
  g.fillRect(sx - 6 * z, sy - 18 * z, 5 * z, 6 * z);
  g.fillRect(sx + 1 * z, sy - 16 * z, 5 * z, 6 * z);
}

function drawLamp(g, sx, sy, z) {
  g.strokeStyle = '#2a2420';
  g.lineWidth = 2.2 * z;
  g.beginPath();
  g.moveTo(sx, sy + 4 * z);
  g.lineTo(sx, sy - 26 * z);
  g.stroke();
  const glow = g.createRadialGradient(sx, sy - 28 * z, 1, sx, sy - 28 * z, 18 * z);
  glow.addColorStop(0, 'rgba(255,210,130,0.9)');
  glow.addColorStop(0.4, 'rgba(255,170,80,0.25)');
  glow.addColorStop(1, 'rgba(255,140,40,0)');
  g.fillStyle = glow;
  g.beginPath(); g.arc(sx, sy - 28 * z, 18 * z, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#f0d080';
  g.beginPath(); g.arc(sx, sy - 28 * z, 3.2 * z, 0, Math.PI * 2); g.fill();
  // ground pool
  const pool = g.createRadialGradient(sx, sy + 4 * z, 1, sx, sy + 4 * z, 22 * z);
  pool.addColorStop(0, 'rgba(255,180,80,0.2)');
  pool.addColorStop(1, 'rgba(255,180,80,0)');
  g.fillStyle = pool;
  g.beginPath(); g.ellipse(sx, sy + 4 * z, 22 * z, 10 * z, 0, 0, Math.PI * 2); g.fill();
}

function drawStairs(g, sx, sy, z) {
  // Decorative only — not climbable.
  const pal = { left: '#6a6458', right: '#4e4a40', top: '#9a9488', edge: '#2a2820' };
  for (let i = 0; i < 4; i++) {
    const ox = -i * 3 * z, oy = -i * 5 * z;
    isoBox(g, sx + ox, sy + oy, z * 0.85, 4 * z, pal);
  }
}

function drawBoat(g, t, sx, sy, z) {
  const kind = t.hue || 'tug';
  const col = kind === 'tug' ? '#4a3a32' : kind === 'work' ? '#3a4a48' : '#2a3238';
  g.fillStyle = col;
  g.strokeStyle = '#121416';
  g.lineWidth = 1 * z;
  g.beginPath();
  g.moveTo(sx - 16 * z, sy + 2 * z);
  g.lineTo(sx - 8 * z, sy - 6 * z);
  g.lineTo(sx + 14 * z, sy - 4 * z);
  g.lineTo(sx + 10 * z, sy + 6 * z);
  g.closePath(); g.fill(); g.stroke();
  if (kind !== 'small') {
    g.fillStyle = shift(col, 20);
    g.fillRect(sx - 4 * z, sy - 14 * z, 10 * z, 8 * z);
    g.fillStyle = '#c45a3a';
    g.fillRect(sx - 1 * z, sy - 20 * z, 2.2 * z, 8 * z);
  }
}

export function drawBlastPreview(g, cx, cy, z, radius) {
  g.save();
  g.globalAlpha = 0.28;
  for (let i = 1; i <= radius; i++) {
    g.strokeStyle = '#e07a6a';
    g.lineWidth = 1.5 * z;
    g.beginPath();
    g.ellipse(cx, cy, (TW * z * 0.55) * i, (TH * z * 0.55) * i, 0, 0, Math.PI * 2);
    g.stroke();
  }
  g.restore();
}
