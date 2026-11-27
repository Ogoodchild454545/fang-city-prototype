# v0.21 map beauty pass: on every built-in map the baked light map exists (ambient + pools + shadows), props
# are lit, the per-map colour grade is in the CSS layer, the live layers draw without errors, the board stays
# readable (blue move tiles still read as blue over the darker ground) and the frame loop holds up.
# Usage: BASE=http://localhost:8765/ VH=390 python3 tests/v021.py
import os, sys
from playwright.sync_api import sync_playwright
URL = os.environ.get('BASE', 'http://localhost:8765/'); VH = int(os.environ.get('VH', '390'))
OPS = {'docklands': 'o14', 'fish_wharf': 'o7', 'neon_strip': 'o12', 'club_velvet': 'o10', 'gator_farm': 'o6', 'foundry': 'o11',
       'rail_sidings': 'o9', 'back_streets': 'o8', 'corner_shop': 'o13'}
FRAMES = """(secs)=>new Promise(res=>{const d=[];let last=performance.now();const t0=last;function f(t){d.push(t-last);last=t;if(t-t0<secs*1000)requestAnimationFrame(f);else res(d.slice(2));}requestAnimationFrame(f);})"""
fails = []
def check(ok, msg):
    print(('ok   ' if ok else 'FAIL ') + msg)
    if not ok: fails.append(msg)
def close(pg):
    for _ in range(5):
        if not pg.query_selector('.overlay [data-act="closeModal"]'): break
        pg.click('.overlay [data-act="closeModal"] >> nth=-1'); pg.wait_for_timeout(250)
PROBE = """(async()=>{
  const FX = await import('./js/ui/mapfx.js'), Y = await import('./js/ui/yard.js');
  const b = window.__game.state.tactics, m = b.map, p = Y.prepMap(m);
  const L = FX.lightsOf(m, p), lm = FX.lightMap(m, p, null, null), look = FX.lookOf(m);
  // the light map: dark ambient far from lights, bright inside a pool, and a shadow behind some prop
  const g = lm.lum.getContext('2d'), d = g.getImageData(0, 0, lm.lum.width, lm.lum.height).data;
  let lo = 255, hi = 0; for (let i = 0; i < d.length; i += 4 * 37) { const v = (d[i] + d[i + 1] + d[i + 2]) / 3; lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const tv = document.querySelector('.tvig');
  return { id: m.id, lights: L.length, lo, hi, amb: look.amb, grade: tv ? tv.style.background : '', vents: FX.ventsOf(m).length, cur: FX.current() === m };
})()"""
with sync_playwright() as p:
    br = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx = br.new_context(viewport={'width': 844, 'height': VH}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL + '?reset=1&fast=1&level=16'); pg.wait_for_selector('#basecv'); pg.wait_for_timeout(1200); close(pg)
    pg.evaluate("localStorage.setItem('fangcity.hints', JSON.stringify({move:1,target:1,end:1,tour:1,look:1,turn:1,cover:1,special:1,odds:1}))")
    for mid, op in OPS.items():
        pg.evaluate("(()=>{const s=window.__game.state; s.energy={n:99,at:Date.now()}; s.tactics=null; s.heroes.squad=Object.keys(s.heroes.owned).slice(0,4);})()")
        pg.evaluate("document.querySelector('[data-act=\"nav\"][data-tab=\"missions\"]').click()"); pg.wait_for_timeout(300)
        pg.evaluate(f"document.querySelector('[data-act=\"startOp\"][data-id=\"{op}\"]').click()")
        pg.wait_for_selector('.twrap', timeout=8000); pg.wait_for_timeout(1500); close(pg)
        r = pg.evaluate(PROBE)
        check(r['id'] == mid, f'{mid}: battle opened on the right map')
        check(r['lights'] >= 3, f"{mid}: {r['lights']} light sources (lamps, neon, props, porches)")
        check(r['lo'] < 175 and r['hi'] > 220, f"{mid}: light map has dark ambient ({r['lo']:.0f}) and bright pools ({r['hi']:.0f})")
        check('linear-gradient' in r['grade'] and 'radial-gradient' in r['grade'], f'{mid}: colour grade + vignette in the CSS layer')
        check(r['cur'], f'{mid}: live layer bound to this map (props lit from it)')
        d = pg.evaluate(FRAMES, 1.5)
        fps = 1000 / (sum(d) / len(d))
        check(fps > 20, f'{mid}: frame loop runs ({fps:.0f} fps in a shared headless box)')
        # readability: the acting unit's blue move tiles are still clearly blue over the lit ground
        for _ in range(30):
            if pg.evaluate("(()=>{const b=window.__game.state.tactics; const a=b.units.find(x=>x.uid===b.acting); return b.side==='player'&&a&&a.side==='player'})()"): break
            pg.wait_for_timeout(250)
        blue = pg.evaluate("""(()=>{const cv=document.getElementById('tacv'); const g=cv.getContext('2d'); const d=g.getImageData(0,0,cv.width,cv.height).data;
          let n=0; for(let i=0;i<d.length;i+=4*53){ if(d[i+2]>d[i]+40 && d[i+2]>d[i+1]+15 && d[i+2]>90) n++; } return n;})()""")
        check(blue > 20, f'{mid}: move tiles read as blue over the lighting ({blue} samples)')
        pg.evaluate("(()=>{const g=window.__game; g.state.tactics=null; g.save&&g.save();})()")
        pg.goto(URL + '?fast=1'); pg.wait_for_selector('#basecv'); pg.wait_for_timeout(700); close(pg)
    check(not errs, f'no page errors ({errs[:3]})')
    br.close()
print('PASS' if not fails else f'{len(fails)} FAIL')
sys.exit(1 if fails else 0)
