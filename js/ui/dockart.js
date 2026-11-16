// Docklands yard art entry point for the tactics view. Flat map: stacks and walls are
// scenery-height only, not climbable high ground. All art is drawn in canvas (see yard.js);
// no third-party tilesets.
import * as Yard from './yard.js';
import { TW, TH, toWorld } from './yard.js';
export { TW, TH, toWorld };
export { drawYard, drawBackdrop, drawScenery, sceneryOf, prepMap, isTall, drawVignette, CUT } from './yard.js';

export function drawSky(g, w, h) { Yard.drawNightSky(g, w, h); }

export function isPairedWest(t) {
  return t && (t.decor === 'van' || t.decor === 'wreck' || t.decor === 'car');
}
export function skipPairedEast(t) {
  return t && (t.decor === 'van2' || t.decor === 'wreck2' || t.decor === 'car2');
}

export function propHeight(t) { return Yard.propHeight(t); }

export function drawProp(g, t, sx, sy, z, now) {
  if (!t || !t.decor || skipPairedEast(t)) return;
  g.save();
  Yard.drawYardProp(g, t, sx, sy, z, now || performance.now());
  g.restore();
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
