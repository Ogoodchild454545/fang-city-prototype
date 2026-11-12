// Rival crew AI. Produces one action at a time so the renderer can animate each step,
// and a server could run it for offline defence battles (attacking another player's crew).
import { living, reachable, attackPreview, dist, inCover, hasLOS, COST, unitById } from './battle.js';

function expected(p, t) {
  if (!p) return -1;
  const avg = (p.min + p.max) / 2;
  let s = (p.chance / 100) * avg;
  if (avg >= t.hp) s += 12 * (p.chance / 100); // finishing blows are worth more
  return s;
}

function bestAttack(b, u, pos) {
  let best = null;
  for (const t of living(b, 'player')) {
    const modes = u.weapon.kind === 'melee' ? ['shot'] : (u.ap >= COST.aimed ? ['aimed', 'shot'] : ['shot']);
    if (u.gadget && u.gadget.effect === 'throw' && !u.gadgetUsed) modes.push('throw');
    for (const mode of modes) {
      const p = attackPreview(b, u, t, mode, pos);
      if (!p || p.cost > u.ap) continue;
      if (!p.melee && mode !== 'throw' && p.chance < 22) continue;
      const s = expected(p, t) * (mode === 'aimed' ? 0.97 : 1);
      if (!best || s > best.score) best = { target: t, mode, score: s, p };
    }
  }
  return best;
}

function tileScore(b, u, tile, foes) {
  const pos = { x: tile.x, y: tile.y };
  const apLeft = u.ap - tile.cost;
  let score = 0;
  // can we attack from here with the AP left?
  if (apLeft >= 2) {
    let bestA = 0;
    for (const t of foes) {
      const p = attackPreview(b, { ...u, ap: apLeft }, t, 'shot', pos);
      if (p) bestA = Math.max(bestA, expected(p, t));
    }
    score += bestA * 1.3;
  }
  const nearest = Math.min(...foes.map((f) => dist(pos, f)));
  if (u.weapon.kind === 'melee') score -= nearest * 2.2;
  else score -= Math.abs(nearest - Math.min(u.weapon.range - 1, 4)) * 1.4;
  if (u.weapon.kind !== 'melee') {
    for (const f of foes) {
      if (f.weapon.kind === 'melee') continue;
      const d = dist(pos, f);
      if (d > f.weapon.range || !hasLOS(b, f, pos)) continue;
      score += inCover(b, f, pos) ? 2.5 : -3;
    }
  }
  if (u.role === 'doc') {
    const hurt = living(b, u.side).filter((a) => a.uid !== u.uid && a.hp < a.maxHp * 0.7);
    if (hurt.length) score -= Math.min(...hurt.map((a) => dist(pos, a))) * 1.5;
  }
  return score;
}

export function aiNextAction(b) {
  if (b.status !== 'active' || b.side !== 'enemy') return null;
  b.meta.aiDone = b.meta.aiDone && b.meta.aiTurn === b.turn ? b.meta.aiDone : [];
  b.meta.aiMoved = b.meta.aiMoved && b.meta.aiTurn === b.turn ? b.meta.aiMoved : [];
  b.meta.aiTurn = b.turn;
  const foes = living(b, 'player');
  if (!foes.length) return { type: 'end' };

  for (const u of living(b, 'enemy')) {
    if (b.meta.aiDone.includes(u.uid) || u.ap <= 0) continue;

    // 1) heal
    if (u.role === 'doc' && !u.patched && u.ap >= COST.patch) {
      const hurt = living(b, 'enemy').filter((a) => dist(a, u) <= 1 && a.hp < a.maxHp * 0.6).sort((a, c) => a.hp / a.maxHp - c.hp / c.maxHp)[0];
      if (hurt) return { type: 'patch', uid: u.uid, target: hurt.uid };
    }
    if (u.gadget && !u.gadgetUsed && u.gadget.effect === 'heal' && u.hp < u.maxHp * 0.45) return { type: 'gadget', uid: u.uid, target: u.uid };
    if (u.gadget && !u.gadgetUsed && u.gadget.effect === 'ap' && u.ap === u.maxAp && bestAttack(b, u, u)) return { type: 'gadget', uid: u.uid };

    // 2) attack from here
    const atk = bestAttack(b, u, u);
    if (atk && atk.score > 1.2) return { type: 'attack', uid: u.uid, target: atk.target.uid, mode: atk.mode };

    // 3) reposition once per turn
    if (!b.meta.aiMoved.includes(u.uid)) {
      b.meta.aiMoved.push(u.uid);
      const tiles = [...reachable(b, u).values()];
      let best = { x: u.x, y: u.y, cost: 0, score: tileScore(b, u, { x: u.x, y: u.y, cost: 0 }, foes) };
      for (const t of tiles) {
        const s = tileScore(b, u, t, foes);
        if (s > best.score + 0.01) best = { ...t, score: s };
      }
      if (best.x !== u.x || best.y !== u.y) return { type: 'move', uid: u.uid, x: best.x, y: best.y };
    }

    // 4) suppress if nothing better
    if ((u.role === 'shooter' || u.role === 'marksman') && u.ap >= COST.suppress) {
      const t = foes.filter((f) => dist(f, u) <= u.weapon.range && hasLOS(b, u, f)).sort((a, c) => c.aim - a.aim)[0];
      if (t && !t.status.suppressed) return { type: 'suppress', uid: u.uid, target: t.uid };
    }
    b.meta.aiDone.push(u.uid);
  }
  return { type: 'end' };
}

// Utility for tests / auto-resolve: the same AI can play the player side.
export function aiNextActionFor(b, side) {
  if (side === 'enemy') return aiNextAction(b);
  // mirror: temporarily swap sides
  const swap = (s) => (s === 'player' ? 'enemy' : s === 'enemy' ? 'player' : s);
  for (const u of b.units) u.side = swap(u.side);
  b.side = swap(b.side);
  const a = aiNextAction(b);
  for (const u of b.units) u.side = swap(u.side);
  b.side = swap(b.side);
  return a;
}
