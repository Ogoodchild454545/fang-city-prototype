// Deterministic seeded RNG (mulberry32). State is a single uint32 stored in JSON,
// so a server can replay or verify any battle from the same seed + action list.
export function rngNext(holder, key = 'rng') {
  let t = (holder[key] = (holder[key] + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const rngInt = (h, min, max, key) => min + Math.floor(rngNext(h, key) * (max - min + 1));
export const rngPick = (h, arr, key) => arr[Math.floor(rngNext(h, key) * arr.length)];
export function rngWeighted(h, table, key) {
  // table: [[value, weight], ...]
  const total = table.reduce((s, [, w]) => s + w, 0);
  let r = rngNext(h, key) * total;
  for (const [v, w] of table) { if ((r -= w) < 0) return v; }
  return table[table.length - 1][0];
}
export const newSeed = () => (Math.random() * 4294967296) >>> 0;
