const UNITS = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc'];
export function fmt(n, dec = 1) {
  if (!isFinite(n)) return '∞';
  const neg = n < 0; n = Math.abs(n);
  let out;
  if (n < 1000) out = n < 10 && n % 1 ? n.toFixed(1) : Math.floor(n).toString();
  else {
    const e = Math.min(UNITS.length - 1, Math.floor(Math.log10(n) / 3));
    const v = n / Math.pow(1000, e);
    out = (v >= 100 ? Math.floor(v) : v.toFixed(v >= 10 ? 1 : 2).replace(/\.?0+$/, '')) + UNITS[e];
  }
  return (neg ? '-' : '') + out;
}
export const money = (n) => '$' + fmt(n);
export const resName = (r) => (r === 'influence' ? 'Rep' : r === 'cash' ? 'Cash' : r === 'teeth' ? 'Gold Teeth' : r);
export function dur(sec) {
  sec = Math.max(0, Math.ceil(sec));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60), s = sec % 60;
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function rewardText(r) {
  const p = [];
  if (r.cash) p.push(money(r.cash));
  if (r.teeth) p.push(`🦷 ${fmt(r.teeth)}`);
  if (r.influence) p.push(`🐾 ${fmt(r.influence)} Rep`);
  if (r.ticket) p.push(`🎟️ ${r.ticket} rush ticket`);
  if (r.gear) p.push(`🎒 gear`);
  if (r.skin) p.push(`✨ ${r.skin} skin`);
  return p.join(' · ');
}
