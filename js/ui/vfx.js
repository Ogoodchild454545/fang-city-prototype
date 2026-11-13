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
  fx.bits.push({ typ: 'flash', x, y, t0: now, life: 420, scale });
  // smoke puffs
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.8;
    const sp = 0.3 + Math.random() * 0.9;
    fx.bits.push({
      typ: 'smoke',
      x: x + (Math.random() - 0.5) * 10 * scale,
      y: y + (Math.random() - 0.5) * 6 * scale,
      vx: Math.cos(a) * sp * scale,
      vy: -0.4 * scale - Math.random() * 0.7,
      r: (6 + Math.random() * 8) * scale,
      grow: 18 * scale,
      t0: now + i * 18,
      life: 700 + Math.random() * 400,
    });
  }
  // debris
  for (let i = 0; i < 12; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6;
    const sp = 1.4 + Math.random() * 3.4;
    fx.bits.push({
      typ: 'debris',
      x, y,
      vx: Math.cos(a) * sp * scale,
      vy: Math.sin(a) * sp * scale - 1.5,
      rot: Math.random() * Math.PI,
      rv: (Math.random() - 0.5) * 0.4,
      t0: now,
      life: 550 + Math.random() * 350,
      w: (2 + Math.random() * 4) * scale,
      h: (1.5 + Math.random() * 3) * scale,
      tone: Math.random(),
    });
  }
  // embers
  for (let i = 0; i < 7; i++) {
    const a = Math.random() * Math.PI * 2;
    fx.bits.push({
      typ: 'ember',
      x, y,
      vx: Math.cos(a) * (0.4 + Math.random()) * scale,
      vy: -0.8 - Math.random() * 1.6,
      t0: now,
      life: 400 + Math.random() * 300,
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
    life: kind === 'crit' ? 900 : 750,
  });
}

// Store a camera nudge toward a world-buffer point (already * z).
export function nudgeToward(fx, x, y, strength = 1) {
  const now = performance.now();
  fx.nudge = { x, y, t0: now, dur: 520, strength: Math.max(0.4, Math.min(1.4, strength)) };
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
  const order = { smoke: 0, debris: 1, flash: 2, ember: 3, spark: 4, casing: 5, tracer: 6, callout: 7 };
  const bits = fx.bits.slice().sort((a, c) => (order[a.typ] ?? 5) - (order[c.typ] ?? 5));
  for (const b of bits) {
    const age = now - b.t0;
    if (age < 0) { left.push(b); continue; } // not started (staggered smoke)
    if (age > b.life) continue;
    if (b.typ === 'casing' || b.typ === 'debris' || b.typ === 'spark' || b.typ === 'ember' || b.typ === 'smoke') {
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
      } else if (b.typ === 'smoke') {
        b.vy *= 0.98;
        b.vx *= 0.98;
      }
    }
    left.push(b);
  }
  fx.bits = left;
}

export function draw(g, fx, z) {
  if (!fx) return;
  const now = performance.now();
  for (const b of fx.bits) {
    const age = now - b.t0;
    if (age < 0) continue;
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
      const rad = (20 + (1 - k) * 40) * z * (b.scale || 1);
      g.save();
      g.globalCompositeOperation = 'lighter';
      const grd = g.createRadialGradient(b.x, b.y, 2, b.x, b.y, rad);
      grd.addColorStop(0, `rgba(255,245,200,${1.0 * k})`);
      grd.addColorStop(0.35, `rgba(255,140,40,${0.7 * k})`);
      grd.addColorStop(0.7, `rgba(160,40,10,${0.35 * k})`);
      grd.addColorStop(1, 'rgba(40,10,0,0)');
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
      g.fillStyle = t < 0.4 ? '#5a4330' : t < 0.7 ? '#8a6a40' : '#3a332c';
      g.fillRect(-b.w * z * 0.5, -b.h * z * 0.5, b.w * z, b.h * z);
      g.restore();
    } else if (b.typ === 'ember') {
      const fade = 1 - u;
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = `rgba(255,160,40,${0.85 * fade})`;
      g.beginPath(); g.arc(b.x, b.y, 1.4 * z, 0, Math.PI * 2); g.fill();
      g.restore();
    } else if (b.typ === 'callout') {
      const enter = Math.min(1, age / 110);
      const pop = enter < 1 ? 0.6 + 0.7 * (1 - Math.pow(1 - enter, 3)) : 1 - 0.08 * u;
      const fade = u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3;
      g.save();
      g.translate(b.x, b.y - 18 * z * u);
      g.scale(pop, pop);
      g.globalAlpha = fade;
      const fontPx = Math.round((b.kind === 'crit' ? 16 : 13) * z);
      g.font = `bold ${fontPx}px Oswald, Impact, sans-serif`;
      g.textAlign = 'center';
      g.lineJoin = 'round';
      g.lineWidth = 3.2 * z;
      g.strokeStyle = 'rgba(8,6,6,0.85)';
      g.fillStyle = b.kind === 'miss' ? '#c8d0d8' : b.kind === 'crit' ? '#ffe27a' : '#f4f0e4';
      g.strokeText(b.text, 0, 0);
      g.fillText(b.text, 0, 0);
      g.restore();
    }
  }
}
