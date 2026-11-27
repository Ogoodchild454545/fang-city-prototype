# v0.22 painted props (Docklands sample): the prop art is not fetched until Docklands is drawn, then every
# sprite loads, the props draw from it (vehicles, crates, barriers, barrels, lamps, boats, bollards, desk,
# shelf, container steel), footprints/cover are unchanged, tiles stay readable and the frame loop holds.
# Usage: BASE=http://localhost:8765/ VH=390 python3 tests/v022.py
import os
from playwright.sync_api import sync_playwright
URL = os.environ.get('BASE', 'http://localhost:8765/'); VH = int(os.environ.get('VH', '390'))
FRAMES = """(secs)=>new Promise(res=>{const d=[];let last=performance.now();const t0=last;function f(t){d.push(t-last);last=t;if(t-t0<secs*1000)requestAnimationFrame(f);else res(d.slice(2));}requestAnimationFrame(f);})"""
fails = []
def check(ok, msg):
    print(('ok   ' if ok else 'FAIL ') + msg)
    if not ok: fails.append(msg)
def close(pg):
    for _ in range(5):
        if not pg.query_selector('.overlay [data-act="closeModal"]'): break
        pg.click('.overlay [data-act="closeModal"] >> nth=-1'); pg.wait_for_timeout(250)
def start(pg, op):
    pg.evaluate("(()=>{const s=window.__game.state; s.energy={n:99,at:Date.now()}; s.tactics=null; s.heroes.squad=Object.keys(s.heroes.owned).slice(0,4);})()")
    pg.evaluate("document.querySelector('[data-act=\"nav\"][data-tab=\"missions\"]').click()"); pg.wait_for_timeout(300)
    pg.evaluate(f"document.querySelector('[data-act=\"startOp\"][data-id=\"{op}\"]').click()")
    pg.wait_for_selector('.twrap', timeout=8000); pg.wait_for_timeout(1800); close(pg)
PROPS = "performance.getEntriesByType('resource').filter(e=>e.name.includes('assets/props/')).map(e=>e.name.split('/').pop())"
with sync_playwright() as p:
    br = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx = br.new_context(viewport={'width': 844, 'height': VH}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL + '?reset=1&fast=1&level=16'); pg.wait_for_selector('#basecv'); pg.wait_for_timeout(1200); close(pg)
    pg.evaluate("localStorage.setItem('fangcity.hints', JSON.stringify({move:1,target:1,end:1,tour:1,look:1,turn:1,cover:1,special:1,odds:1}))")
    check(not pg.evaluate(PROPS), 'no prop art fetched at the hideout (lazy per map)')
    start(pg, 'o12')  # Neon Strip: no painted set yet
    check(not pg.evaluate(PROPS), 'no Docklands art fetched for another map')
    pg.evaluate("(()=>{const g=window.__game; g.state.tactics=null; g.save&&g.save();})()")
    pg.goto(URL + '?fast=1'); pg.wait_for_selector('#basecv'); pg.wait_for_timeout(700); close(pg)
    start(pg, 'o14')  # Docklands
    pg.wait_for_timeout(1200)
    r = pg.evaluate("""(async()=>{
      const PA = await import('./js/ui/propart.js'), Y = await import('./js/ui/yard.js');
      const m = window.__game.state.tactics.map, set = PA.SETS.docklands, names = Object.keys(set.art);
      const bad = names.filter(n => { const im = PA.img(m, n); return !im || !im.naturalWidth; });
      const kinds = {}; for (const row of m.tiles) for (const t of row) if (t.decor) kinds[t.decor] = (kinds[t.decor] || 0) + 1;
      const h = {}; for (const row of m.tiles) for (const t of row) if (t.decor) h[t.decor] = Y.propHeight(t);
      return { id: m.id, ready: PA.has(m), n: names.length, bad, kinds, h };
    })()""")
    check(r['id'] == 'docklands', 'battle opened on Docklands')
    check(r['ready'] and not r['bad'], f"all {r['n']} painted sprites loaded ({r['bad']})")
    files = pg.evaluate(PROPS)
    check(len(files) == r['n'] and all(f.endswith('.webp') for f in files), f'{len(files)} WebP files fetched once each for Docklands')
    # cover heights are the gameplay values (unchanged by the art)
    H = r['h']
    check(H.get('van') == 18 and H.get('crate') == 16 and H.get('barrier') == 12 and H.get('barrel') == 12, f'prop heights unchanged ({H})')
    d = pg.evaluate(FRAMES, 1.5)
    fps = 1000 / (sum(d) / len(d))
    check(fps > 20, f'frame loop runs ({fps:.0f} fps in a shared headless box)')
    for _ in range(30):
        if pg.evaluate("(()=>{const b=window.__game.state.tactics; const a=b.units.find(x=>x.uid===b.acting); return b.side==='player'&&a&&a.side==='player'})()"): break
        pg.wait_for_timeout(250)
    blue = pg.evaluate("""(()=>{const cv=document.getElementById('tacv'); const g=cv.getContext('2d'); const d=g.getImageData(0,0,cv.width,cv.height).data;
      let n=0; for(let i=0;i<d.length;i+=4*53){ if(d[i+2]>d[i]+40 && d[i+2]>d[i+1]+15 && d[i+2]>90) n++; } return n;})()""")
    check(blue > 20, f'move tiles read as blue over the painted props ({blue} samples)')
    # destroyed states draw from their own art: the vans become wrecks, drums burst
    pg.evaluate("""(()=>{const m=window.__game.state.tactics.map;
      for(const r of m.tiles)for(const t of r){ if(t.decor==='van'&&t.hue==='grey'){t.decor='wreck'} else if(t.decor==='van2'&&t.hue==='grey'){t.decor='wreck2'} else if(t.decor==='barrel'){t.decor='barrelWreck'} }})()""")
    pg.wait_for_timeout(600)
    check(not errs, f'no page errors ({errs[:3]})')
    br.close()
print('FAILS:', len(fails))
raise SystemExit(1 if fails else 0)
