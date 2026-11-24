// Battle-feel particles: tracers, casings, impact sparks, explosions, HIT/MISS
// callouts and a camera nudge toward the action. Pure canvas, no assets.
export function create() {
  return { bits: [], nudge: null };
}

export function ensure(u) {
  if (!u.fx) u.fx = create();
  return u.fx;
}

export function spawnTracer(fx, x0, y0, x1, y1, opts = {}) {
  const dx = x1 - x0, dy = y1 - y0;
  const dist = Math.hypot(dx, dy) || 1;
  fx.bits.push({
    typ: 'tracer',
    x0, y0, x1, y1,
    t0: performance.now(),
    dur: opts.dur || Math.max(70, Math.min(160, dist * 0.35)),
    miss: !!opts.miss,
    width: opts.width || 1.6,
  });
}

export function spawnCasings(fx, x, y, facing, n = 1) {
  const now = performance.now();
  for (let i = 0; i < n; i++) {
    const dir = facing >= 0 ? -1 : 1; // eject to the side opposite the barrel
    const sp = 0.9 + Math.random() * 1.4;
    fx.bits.push({
      typ: 'casing',
      x, y,
      vx: dir * (1.6 + Math.random() * 1.8) * sp,
      vy: -2.2 - Math.random() * 2.4,
      rot: Math.random() * Math.PI,
      rv: (Math.random() - 0.5) * 0.6,
      t0: now,
      life: 620 + Math.random() * 280,
      floor: y + 10 + Math.random() * 6,
    });
  }
}

export function spawnSparks(fx, x, y, n = 10) {
  const now = performance.now();
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 1.2 + Math.random() * 3.2;
    fx.bits.push({
      typ: 'spark',
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 0.8,
      t0: now,
      life: 180 + Math.random() * 180,
      len: 3 + Math.random() * 5,
    });
  }
}

export function spawnExplosion(fx, x, y, scale = 1) {
  const now = performance.now();
  // Bright fireball core first; smoke is staggered so the flash reads.
  fx.bits.push({ typ: 'flash', x, y, t0: now, life: 380, scale });
  fx.bits.push({ typ: 'flash', x, y, t0: now, life: 220, scale: scale * 0.62, core: 1 });
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.8;
    const sp = 0.25 + Math.random() * 0.7;
    fx.bits.push({
      typ: 'smoke',
      x: x + (Math.random() - 0.5) * 10 * scale,
      y: y + (Math.random() - 0.5) * 6 * scale,
      vx: Math.cos(a) * sp * scale,
      vy: -0.35 * scale - Math.random() * 0.6,
      r: (6 + Math.random() * 8) * scale,
      grow: 20 * scale,
      t0: now + 130 + i * 24,
      life: 780 + Math.random() * 400,
    });
  }
  for (let i = 0; i < 18; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.8;
    const sp = 2.0 + Math.random() * 4.2;
    fx.bits.push({
      typ: 'debris',
      x, y,
      vx: Math.cos(a) * sp * scale,
      vy: Math.sin(a) * sp * scale - 2.2,
      rot: Math.random() * Math.PI,
      rv: (Math.random() - 0.5) * 0.5,
      t0: now,
      life: 650 + Math.random() * 400,
      w: (3 + Math.random() * 6) * scale,
      h: (2 + Math.random() * 4) * scale,
      tone: Math.random(),
    });
  }
  for (let i = 0; i < 12; i++) {
    const a = Math.random() * Math.PI * 2;
    fx.bits.push({
      typ: 'ember',
      x, y,
      vx: Math.cos(a) * (0.6 + Math.random() * 1.4) * scale,
      vy: -1.2 - Math.random() * 2.2,
      t0: now,
      life: 480 + Math.random() * 320,
    });
  }
}

export function spawnCallout(fx, x, y, text, kind = 'hit') {
  fx.bits.push({
    typ: 'callout',
    x, y,
    text,
    kind, // hit | miss | crit
    t0: performance.now(),
    life: kind === 'crit' || kind === 'overwatch' ? 980 : 750,
  });
}

// Store a camera nudge toward a world-buffer point (already * z).
export function nudgeToward(fx, x, y, strength = 1) {
  const now = performance.now();
  fx.nudge = { x, y, t0: now, dur: 520, strength: Math.max(0.4, Math.min(1.4, strength)) };
}

// Pan and gently zoom toward a WORLD point (toWorld, not pre-multiplied by z),
// hold on the action, then ease back to the original camera.
export function panCam(fx, cam, worldX, worldY, cv, opts = {}) {
  if (!cam || !cv) return;
  const zoom = opts.zoom == null ? 1.15 : opts.zoom;
  const durIn = opts.durIn || 260;
  const hold = opts.hold || 480;
  const durOut = opts.durOut || 420;
  // If a pan is already running, keep its resting framing as the base; otherwise chained
  // shot/explosion pans would restore to a half-zoomed camera and creep ever closer.
  const base = fx.pan ? { x: fx.pan.fromX, y: fx.pan.fromY, z: fx.pan.fromZ } : { x: cam.x, y: cam.y, z: cam.z };
  fx.pan = {
    t0: performance.now(),
    durIn, hold, durOut,
    fromX: base.x, fromY: base.y, fromZ: base.z,
    startX: cam.x, startY: cam.y, startZ: cam.z,
    worldX, worldY,
    toZ: base.z * zoom,
    cvW: cv.width || 0,
    cvH: cv.height || 0,
    cy: 0.56,
  };
}

export function applyPan(fx, cam) {
  const p = fx && fx.pan;
  if (!p || !cam) return;
  const elapsed = performance.now() - p.t0;
  const tIn = p.durIn, tHold = tIn + p.hold, tOut = tHold + p.durOut;
  const ease = (u) => u * u * (3 - 2 * u);
  let k;
  if (elapsed < tIn) k = ease(elapsed / tIn);
  else if (elapsed < tHold) k = 1;
  else if (elapsed < tOut) k = 1 - ease((elapsed - tHold) / p.durOut);
  else {
    cam.x = p.fromX; cam.y = p.fromY; cam.z = p.fromZ;
    fx.pan = null;
    return;
  }
  // Ease in from wherever the camera was (may be mid-pan), ease out to the resting framing.
  const inPhase = elapsed < tHold;
  const sx = inPhase && p.startX != null ? p.startX : p.fromX;
  const sy = inPhase && p.startY != null ? p.startY : p.fromY;
  const sz = inPhase && p.startZ != null ? p.startZ : p.fromZ;
  const z = sz + (p.toZ - sz) * k;
  const tx = p.cvW * 0.50 - p.worldX * z;
  const ty = p.cvH * p.cy - p.worldY * z;
  cam.z = z;
  cam.x = sx + (tx - sx) * k;
  cam.y = sy + (ty - sy) * k;
}

// Offset to add to cam translation. Does not mutate cam.x/y (so user pans stay put).
export function nudgeOffset(fx, cam, cv) {
  const n = fx && fx.nudge;
  if (!n) return { x: 0, y: 0 };
  const t = (performance.now() - n.t0) / n.dur;
  if (t >= 1) { fx.nudge = null; return { x: 0, y: 0 }; }
  // ease in, hold, ease out
  let k;
  if (t < 0.22) k = t / 0.22;
  else if (t < 0.55) k = 1;
  else k = 1 - (t - 0.55) / 0.45;
  k = k * k * (3 - 2 * k);
  const pull = 0.22 * n.strength;
  const cx = (cv.width || 0) / 2, cy = (cv.height || 0) / 2;
  return { x: (cx - (cam.x + n.x)) * pull * k, y: (cy - (cam.y + n.y)) * pull * k };
}

export function tick(fx, dt) {
  if (!fx) return;
  const now = performance.now();
  const left = [];
  const order = { ring: 0, crack: 0, dust: 0, smoke: 0, debris: 1, flash: 2, ember: 3, spark: 4, casing: 5, tracer: 6, bolt: 6, mflash: 6, claw: 7, callout: 8 };
  const bits = fx.bits.slice().sort((a, c) => (order[a.typ] ?? 5) - (order[c.typ] ?? 5));
  for (const b of bits) {
    const age = now - b.t0;
    if (age < 0) { left.push(b); continue; } // not started (staggered smoke)
    if (age > b.life) continue;
    if (b.typ === 'casing' || b.typ === 'debris' || b.typ === 'spark' || b.typ === 'ember' || b.typ === 'smoke' || b.typ === 'dust') {
      b.x += b.vx * dt * 60;
      b.y += b.vy * dt * 60;
      if (b.typ === 'casing' || b.typ === 'debris') {
        b.vy += 0.22 * dt * 60;
        b.rot += b.rv * dt * 60;
        if (b.typ === 'casing' && b.floor != null && b.y > b.floor && b.vy > 0) {
          b.y = b.floor;
          b.vy *= -0.28;
          b.vx *= 0.6;
          b.rv *= 0.5;
          if (Math.abs(b.vy) < 0.4) b.vy = 0;
        }
      } else if (b.typ === 'spark') {
        b.vy += 0.12 * dt * 60;
      } else if (b.typ === 'ember') {
        b.vy += 0.04 * dt * 60;
      } else if (b.typ === 'smoke' || b.typ === 'dust') {
        b.vy *= 0.94;
        b.vx *= 0.94;
      }
    }
    left.push(b);
  }
  fx.bits = left;
}

// Bits are spawned in world px at the zoom of that moment; if the camera zooms after (cut-in pans,
// pinch), scale them so they stay glued to the board.
export function draw(g, fx, z) {
  if (!fx) return;
  const now = performance.now();
  for (const b of fx.bits) {
    if (now - b.t0 < 0) continue;
    if (b.z0 == null) b.z0 = b.zs || z;
    const kz = z / b.z0;
    if (kz !== 1) { g.save(); g.scale(kz, kz); }
    drawBit(g, b, b.z0, now);
    if (kz !== 1) g.restore();
  }
}
function drawBit(g, b, z, now) {
  {
    const age = now - b.t0;
    const u = Math.max(0, Math.min(1, age / b.life));
    if (b.typ === 'tracer') {
      const head = Math.min(1, age / b.dur);
      const tail = Math.max(0, head - 0.55);
      const xA = b.x0 + (b.x1 - b.x0) * tail;
      const yA = b.y0 + (b.y1 - b.y0) * tail;
      const xB = b.x0 + (b.x1 - b.x0) * head;
      const yB = b.y0 + (b.y1 - b.y0) * head;
      const fade = head < 1 ? 1 : 1 - u;
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = b.miss ? `rgba(200,210,230,${0.55 * fade})` : `rgba(255,220,140,${0.95 * fade})`;
      g.lineWidth = (b.miss ? 1.1 : 1.8) * z * b.width;
      g.lineCap = 'round';
      g.beginPath(); g.moveTo(xA, yA); g.lineTo(xB, yB); g.stroke();
      if (!b.miss) {
        g.fillStyle = `rgba(255,245,200,${0.9 * fade})`;
        g.beginPath(); g.arc(xB, yB, 2.2 * z, 0, Math.PI * 2); g.fill();
      }
      g.restore();
    } else if (b.typ === 'casing') {
      g.save();
      g.translate(b.x, b.y);
      g.rotate(b.rot);
      g.globalAlpha = 1 - u * u;
      g.fillStyle = '#c9a24a';
      g.fillRect(-1.4 * z, -0.6 * z, 2.8 * z, 1.2 * z);
      g.fillStyle = '#e8d08a';
      g.fillRect(-1.4 * z, -0.6 * z, 0.7 * z, 1.2 * z);
      g.restore();
    } else if (b.typ === 'spark') {
      const fade = 1 - u;
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = `rgba(255,210,120,${0.95 * fade})`;
      g.lineWidth = 1.1 * z;
      g.beginPath();
      g.moveTo(b.x, b.y);
      g.lineTo(b.x - b.vx * b.len * 0.5, b.y - b.vy * b.len * 0.5);
      g.stroke();
      g.restore();
    } else if (b.typ === 'flash') {
      const k = 1 - u;
      const punch = b.core ? (1 - u) * (1 - u) : k;
      const rad = ((b.core ? 16 : 28) + (1 - k) * (b.core ? 22 : 52)) * z * (b.scale || 1);
      g.save();
      g.globalCompositeOperation = 'lighter';
      const grd = g.createRadialGradient(b.x, b.y, 1, b.x, b.y, rad);
      if (b.core) {
        grd.addColorStop(0, `rgba(255,255,230,${1.0 * punch})`);
        grd.addColorStop(0.25, `rgba(255,230,80,${0.95 * punch})`);
        grd.addColorStop(0.6, `rgba(255,140,20,${0.7 * punch})`);
        grd.addColorStop(1, 'rgba(255,60,0,0)');
      } else {
        grd.addColorStop(0, `rgba(255,250,200,${0.95 * k})`);
        grd.addColorStop(0.25, `rgba(255,190,40,${0.85 * k})`);
        grd.addColorStop(0.55, `rgba(255,90,16,${0.55 * k})`);
        grd.addColorStop(1, 'rgba(80,10,0,0)');
      }
      g.fillStyle = grd;
      g.beginPath(); g.arc(b.x, b.y, rad, 0, Math.PI * 2); g.fill();
      g.restore();
    } else if (b.typ === 'smoke') {
      const fade = u < 0.15 ? u / 0.15 : 1 - (u - 0.15) / 0.85;
      const r = (b.r + b.grow * u) * z;
      g.save();
      g.fillStyle = `rgba(60,50,42,${0.28 * fade})`;
      g.beginPath(); g.arc(b.x, b.y, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = `rgba(90,80,70,${0.2 * fade})`;
      g.beginPath(); g.arc(b.x + r * 0.15, b.y - r * 0.1, r * 0.7, 0, Math.PI * 2); g.fill();
      g.restore();
    } else if (b.typ === 'debris') {
      g.save();
      g.translate(b.x, b.y);
      g.rotate(b.rot);
      g.globalAlpha = 1 - u * u;
      const t = b.tone;
      g.fillStyle = t < 0.25 ? '#c4a060' : t < 0.5 ? '#8a5a30' : t < 0.75 ? '#5a3a22' : '#d08040';
      g.fillRect(-b.w * z * 0.5, -b.h * z * 0.5, b.w * z, b.h * z);
      g.fillStyle = 'rgba(255,200,80,0.35)';
      g.fillRect(-b.w * z * 0.5, -b.h * z * 0.5, b.w * z * 0.35, b.h * z);
      g.restore();
    } else if (b.typ === 'ember') {
      const fade = 1 - u;
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = `rgba(255,160,40,${0.85 * fade})`;
      g.beginPath(); g.arc(b.x, b.y, 1.4 * z, 0, Math.PI * 2); g.fill();
      g.restore();
    } else if (b.typ === 'bolt') {
      // v0.14 gunshot: a hot bullet streak (white core, amber glow) that leaves a fading smoke line
      const head = Math.min(1, age / b.dur);
      const xB = b.x0 + (b.x1 - b.x0) * head, yB = b.y0 + (b.y1 - b.y0) * head;
      const tl = Math.max(0, head - 0.35);
      const xA = b.x0 + (b.x1 - b.x0) * tl, yA = b.y0 + (b.y1 - b.y0) * tl;
      const after = head < 1 ? 0 : (age - b.dur) / Math.max(1, b.life - b.dur);
      g.save();
      g.lineCap = 'round';
      // smoke trail along the whole path, fading out
      g.strokeStyle = `rgba(190,190,200,${0.22 * (1 - after) * Math.min(1, age / 60)})`;
      g.lineWidth = 2.2 * z * b.width;
      g.beginPath(); g.moveTo(b.x0, b.y0); g.lineTo(xB, yB); g.stroke();
      if (head < 1 || after < 0.25) {
        const f = head < 1 ? 1 : 1 - after / 0.25;
        g.globalCompositeOperation = 'lighter';
        g.strokeStyle = b.miss ? `rgba(255,170,90,${0.45 * f})` : `rgba(255,150,40,${0.55 * f})`;
        g.lineWidth = 4.2 * z * b.width;
        g.beginPath(); g.moveTo(xA, yA); g.lineTo(xB, yB); g.stroke();
        g.strokeStyle = `rgba(255,250,225,${0.95 * f})`;
        g.lineWidth = 1.3 * z * b.width;
        g.beginPath(); g.moveTo(xA, yA); g.lineTo(xB, yB); g.stroke();
        g.fillStyle = `rgba(255,255,240,${f})`;
        g.beginPath(); g.arc(xB, yB, 1.6 * z * b.width, 0, Math.PI * 2); g.fill();
      }
      g.restore();
    } else if (b.typ === 'mflash') {
      // muzzle bloom: a hard star for one or two frames, then a soft glow
      const k = 1 - u;
      g.save();
      g.globalCompositeOperation = 'lighter';
      const r = (10 + 8 * (1 - k)) * z * b.scale;
      const grd = g.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
      grd.addColorStop(0, `rgba(255,255,230,${k})`); grd.addColorStop(0.3, `rgba(255,200,80,${0.8 * k})`); grd.addColorStop(1, 'rgba(255,90,0,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(b.x, b.y, r, 0, Math.PI * 2); g.fill();
      if (u < 0.45) {
        g.translate(b.x, b.y); g.rotate(b.ang);
        g.fillStyle = `rgba(255,240,190,${0.95 * k})`;
        const L = (16 + 6 * b.scale) * z * b.scale;
        g.beginPath(); g.moveTo(0, -2.4 * z); g.lineTo(L, 0); g.lineTo(0, 2.4 * z); g.closePath(); g.fill();
        g.beginPath(); g.moveTo(-1 * z, -1 * z); g.lineTo(L * 0.35, -6 * z); g.lineTo(2 * z, 0); g.lineTo(L * 0.35, 6 * z); g.lineTo(-1 * z, 1 * z); g.closePath(); g.fill();
      }
      g.restore();
    } else if (b.typ === 'dust') {
      const fade = u < 0.2 ? u / 0.2 : 1 - (u - 0.2) / 0.8;
      const r = (b.r + b.grow * u) * z;
      g.save();
      g.fillStyle = `rgba(${b.col || '150,140,125'},${(b.a || 0.35) * fade})`;
      g.beginPath(); g.ellipse(b.x, b.y, r, r * 0.55, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    } else if (b.typ === 'ring') {
      // ground shockwave (flat ellipse in iso)
      const e = 1 - Math.pow(1 - u, 2);
      const r = (b.r0 + (b.r1 - b.r0) * e) * z;
      g.save();
      g.strokeStyle = `rgba(${b.col || '255,220,170'},${0.8 * (1 - u)})`;
      g.lineWidth = (3 * (1 - u) + 0.6) * z;
      g.beginPath(); g.ellipse(b.x, b.y, r, r * 0.5, 0, 0, Math.PI * 2); g.stroke();
      g.restore();
    } else if (b.typ === 'star') {
      // v0.17 impact star: a hard four-point flash that lands with the hit-stop
      const e = 1 - u, r = (b.r * (0.7 + 0.5 * Math.min(1, age / 50))) * z;
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.translate(b.x, b.y); g.rotate(b.rot || 0);
      g.fillStyle = `rgba(255,248,225,${0.95 * e})`;
      g.beginPath();
      for (let i = 0; i < 8; i++) { const rr = i % 2 ? r * 0.22 : r; const a = i * Math.PI / 4; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.8); }
      g.closePath(); g.fill();
      g.restore();
    } else if (b.typ === 'crack') {
      const grow = Math.min(1, age / 90);
      const fade = u < 0.6 ? 1 : 1 - (u - 0.6) / 0.4;
      g.save();
      g.strokeStyle = `rgba(10,8,6,${0.85 * fade})`;
      g.lineWidth = 1.1 * z; g.lineCap = 'round';
      for (const ln of b.lines) {
        g.beginPath(); g.moveTo(b.x, b.y);
        let px = b.x, py = b.y;
        for (let i = 0; i < ln.length; i++) { const q = ln[i]; if (i / ln.length > grow) break; px = b.x + q[0] * z; py = b.y + q[1] * z; g.lineTo(px, py); }
        g.stroke();
      }
      g.restore();
    } else if (b.typ === 'claw') {
      // three claw rakes cut across the target, drawn on fast, glowing red, then bleeding out
      const draw = Math.min(1, age / b.cut);
      const fade = age < b.cut ? 1 : 1 - (age - b.cut) / (b.life - b.cut);
      g.save();
      g.translate(b.x, b.y); g.rotate(b.ang);
      g.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const off = (i - 1) * 5.2 * z, lag = i * 0.12;
        const d = Math.max(0, Math.min(1, (draw - lag) / (1 - lag * 0.9)));
        if (d <= 0) continue;
        const L = 26 * z * b.scale;
        const x0 = -L / 2, x1 = x0 + L * d;
        const bend = 4 * z;
        const path = () => { g.beginPath(); g.moveTo(x0, off - bend * 0.3); g.quadraticCurveTo((x0 + x1) / 2, off + bend, x1, off - bend * 0.3 + (x1 - x0) * 0.08); };
        g.globalCompositeOperation = 'lighter';
        g.strokeStyle = `rgba(255,30,30,${0.55 * fade})`; g.lineWidth = 5.5 * z * b.scale; path(); g.stroke();
        g.globalCompositeOperation = 'source-over';
        g.strokeStyle = `rgba(140,0,6,${0.95 * fade})`; g.lineWidth = 2.6 * z * b.scale; path(); g.stroke();
        g.strokeStyle = `rgba(255,190,180,${0.9 * fade})`; g.lineWidth = 0.8 * z * b.scale; path(); g.stroke();
      }
      g.restore();
    } else if (b.typ === 'callout') {
      const enter = Math.min(1, age / 110);
      const pop = enter < 1 ? 0.6 + 0.7 * (1 - Math.pow(1 - enter, 3)) : 1 - 0.08 * u;
      const fade = u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3;
      g.save();
      g.translate(b.x, b.y - 10 * z * u);
      g.scale(pop, pop);
      g.globalAlpha = fade;
      const fontPx = Math.round((b.kind === 'crit' || b.kind === 'overwatch' ? 11 : 9) * z);
      g.font = `bold ${fontPx}px Oswald, Impact, sans-serif`;
      g.textAlign = 'center';
      g.lineJoin = 'round';
      g.lineWidth = 2.2 * z;
      g.strokeStyle = 'rgba(8,6,6,0.85)';
      g.fillStyle = b.kind === 'miss' ? '#c8d0d8' : b.kind === 'crit' ? '#ffe27a' : b.kind === 'overwatch' ? '#e0c15a' : b.kind === 'armour' ? '#a9cdf0' : '#f4f0e4';
      g.strokeText(b.text, 0, 0);
      g.fillText(b.text, 0, 0);
      g.restore();
    }
  }
}

// ---------------------------------------------------------------- v0.14 hit effects
// A gunshot: muzzle bloom at the barrel, a bright tracer to the target, then impact sparks and a
// puff of grit on a hit, or a tracer that carries on past the target into a ricochet on a miss.
// Coordinates are world-buffer px (already * z). `pellets` > 1 for shotguns.
export function spawnShot(fx, gx, gy, tx, ty, z, opts = {}) {
  const n0 = fx.bits.length;
  const now = performance.now();
  const hit = !!opts.hit, pellets = opts.pellets || 1;
  const ang = Math.atan2(ty - gy, tx - gx);
  fx.bits.push({ typ: 'mflash', x: gx, y: gy, ang, t0: now, life: 140, scale: pellets > 1 ? 1.25 : 1 });
  fx.bits.push({ typ: 'dust', x: gx + Math.cos(ang) * 6 * z, y: gy + Math.sin(ang) * 6 * z, vx: Math.cos(ang) * 0.6, vy: -0.25, r: 2.5, grow: 9, t0: now + 30, life: 650, col: '170,170,175', a: 0.3 });
  const dist = Math.hypot(tx - gx, ty - gy) || 1;
  for (let i = 0; i < pellets; i++) {
    const spread = pellets > 1 ? (i - (pellets - 1) / 2) * 0.07 + (Math.random() - 0.5) * 0.04 : 0;
    let ex, ey;
    if (hit) {
      ex = tx + Math.cos(ang + Math.PI / 2) * spread * dist * 0.5; ey = ty + Math.sin(ang + Math.PI / 2) * spread * dist * 0.5;
    } else {
      // a miss sails past the target and ends on the ground or a wall behind it
      const over = dist + (38 + Math.random() * 20) * z;
      const a2 = ang + (opts.missSide || 1) * (0.09 + Math.random() * 0.05) + spread;
      ex = gx + Math.cos(a2) * over; ey = gy + Math.sin(a2) * over + 8 * z;
    }
    const d2 = Math.hypot(ex - gx, ey - gy);
    const dur = Math.max(70, Math.min(170, d2 / z * 0.9));
    fx.bits.push({ typ: 'bolt', x0: gx, y0: gy, x1: ex, y1: ey, t0: now, dur, life: dur + 420, width: pellets > 1 ? 0.7 : 1, miss: !hit });
    const land = now + dur;
    if (hit) {
      for (let k = 0; k < (pellets > 1 ? 4 : 12); k++) {
        const a = ang + Math.PI + (Math.random() - 0.5) * 2.4, sp = 1.4 + Math.random() * 3.2;
        fx.bits.push({ typ: 'spark', x: ex, y: ey, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, t0: land, life: 160 + Math.random() * 200, len: 3 + Math.random() * 5 });
      }
      fx.bits.push({ typ: 'flash', x: ex, y: ey, t0: land, life: 140, scale: 0.28, core: 1 });
      fx.bits.push({ typ: 'dust', x: ex, y: ey, vx: Math.cos(ang) * 0.5, vy: -0.2, r: 1.5, grow: 6, t0: land, life: 420, col: '120,110,100', a: 0.4 });
    } else {
      for (let k = 0; k < 7; k++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, sp = 1 + Math.random() * 2.6;
        fx.bits.push({ typ: 'spark', x: ex, y: ey, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t0: land, life: 150 + Math.random() * 160, len: 2 + Math.random() * 4 });
      }
      fx.bits.push({ typ: 'dust', x: ex, y: ey, vx: 0, vy: -0.35, r: 2, grow: 8, t0: land, life: 560, col: '140,130,115', a: 0.45 });
    }
  }
  for (let i = n0; i < fx.bits.length; i++) fx.bits[i].zs = z;
}

// Wolf claw special: three red rakes cut across the target's body.
export function spawnClaws(fx, x, y, z, facing = 1, scale = 1) {
  const n0 = fx.bits.length;
  fx.bits.push({ typ: 'claw', x, y, ang: facing >= 0 ? 0.62 : Math.PI - 0.62, t0: performance.now(), cut: 120, life: 620, scale });
  for (let k = 0; k < 8; k++) {
    const a = (facing >= 0 ? 0.6 : Math.PI - 0.6) + (Math.random() - 0.5) * 1.4, sp = 1 + Math.random() * 2.4;
    fx.bits.push({ typ: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t0: performance.now() + 60, life: 220, len: 3 });
  }
  for (let i = n0; i < fx.bits.length; i++) fx.bits[i].zs = z;
}

// Heavy ground impact (rhino charge / horn slam): shockwave ring, cracks, grit and dust.
export function spawnImpact(fx, x, y, z, scale = 1) {
  const n0 = fx.bits.length;
  const now = performance.now();
  fx.bits.push({ typ: 'ring', x, y, r0: 4, r1: 30 * scale, t0: now, life: 420 });
  fx.bits.push({ typ: 'ring', x, y, r0: 2, r1: 18 * scale, t0: now + 70, life: 360, col: '255,170,90' });
  const lines = [];
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3 + Math.random() * 0.5, L = (8 + Math.random() * 9) * scale, pts = [];
    let px = 0, py = 0;
    for (let k = 1; k <= 4; k++) { px = Math.cos(a) * L * k / 4 + (Math.random() - 0.5) * 2; py = (Math.sin(a) * L * k / 4) * 0.5 + (Math.random() - 0.5); pts.push([px, py]); }
    lines.push(pts);
  }
  fx.bits.push({ typ: 'crack', x, y, lines, t0: now, life: 1100 });
  for (let i = 0; i < 9; i++) {
    const a = Math.random() * Math.PI * 2;
    fx.bits.push({ typ: 'dust', x: x + Math.cos(a) * 4 * z, y: y + Math.sin(a) * 2 * z, vx: Math.cos(a) * 1.2, vy: Math.sin(a) * 0.5 - 0.3, r: 3, grow: 10 * scale, t0: now + i * 12, life: 700, a: 0.4 });
  }
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6, sp = 1.6 + Math.random() * 3;
    fx.bits.push({ typ: 'debris', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.5, rot: Math.random() * 3, rv: (Math.random() - 0.5) * 0.5, t0: now, life: 520, w: 1.5 + Math.random() * 2, h: 1 + Math.random() * 1.5, tone: 0.5 + Math.random() * 0.4 });
  }
  for (let i = n0; i < fx.bits.length; i++) fx.bits[i].zs = z;
}

// Landing puff under a board piece.
export function spawnDust(fx, x, y, z, n = 3) {
  const n0 = fx.bits.length;
  const now = performance.now();
  for (let i = 0; i < n; i++) {
    const s = i - (n - 1) / 2;
    fx.bits.push({ typ: 'dust', x: x + s * 5 * z, y: y + 1 * z, vx: s * 0.5, vy: -0.15, r: 1.6, grow: 5, t0: now, life: 380, a: 0.3 });
  }
  for (let i = n0; i < fx.bits.length; i++) fx.bits[i].zs = z;
}

// v0.17 sharper hit feedback: a quick star flash on the target plus a tight ring.
export function spawnHitPop(fx, x, y, z, crit = 0) {
  const now = performance.now();
  fx.bits.push({ typ: 'star', x, y, r: crit ? 15 : 10, rot: Math.random() * 0.6, t0: now, life: crit ? 150 : 110 });
  fx.bits.push({ typ: 'ring', x, y, r0: 2, r1: crit ? 16 : 11, t0: now, life: 260, col: crit ? '255,220,120' : '255,240,220' });
}
