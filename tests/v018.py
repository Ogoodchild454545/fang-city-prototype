# v0.18: performance & optimisation. Every image the game asks for exists (no 404s, no broken <img>), list
# and modal images load lazily, the first-load / repo asset budget holds, the battle renders without
# per-frame shadowBlur or gradient rebuilds and keeps a clean frame time, the base idles cheaply (and
# stops animating under a sheet), old saves with .jpg/.png paths are pointed at the .webp files, and
# the medic emblems are green crosses. VH=390|340. Frame-timing gates assume the suite runs on its own.
import os, json, re, glob, subprocess, time
from playwright.sync_api import sync_playwright
VH = int(os.environ.get('VH', '390')); URL = os.environ.get('BASE', 'http://localhost:8765/')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
errs, bad = [], []
def close(pg):
    for _ in range(5):
        if not pg.query_selector('.overlay [data-act="closeModal"]'): break
        pg.click('.overlay [data-act="closeModal"] >> nth=-1'); pg.wait_for_timeout(250)
FRAMES = """(secs)=>new Promise(r=>{const d=[];let l=performance.now();const t0=l;const f=(t)=>{d.push(t-l);l=t;if(t-t0<secs*1000)requestAnimationFrame(f);else r(d.slice(1))};requestAnimationFrame(f)})"""
def fstats(d):
    d = sorted(d); n = len(d); return {'n': n, 'fps': round(1000 / (sum(d) / n), 1), 'p50': round(d[n // 2], 1), 'p95': round(d[int(n * 0.95) - 1], 1)}

# ---------------- static asset checks (repo) ----------------
tracked = subprocess.check_output(['git', 'ls-files', 'assets'], cwd=ROOT, text=True).split()
on_disk = [f for f in tracked if os.path.exists(os.path.join(ROOT, f))]
for legacy in ['assets/actors/rook-fig.png', 'assets/actors/anvil-fig.png', 'assets/actors/rook-apose.png', 'assets/icons/ice.png', 'assets/actors/parts/rook-weapon.png']:
    assert not os.path.exists(os.path.join(ROOT, legacy)), f'legacy asset still shipped: {legacy}'
assert not glob.glob(os.path.join(ROOT, 'assets/actors/sheets/*')), 'part source sheets still shipped'
raster = [f for f in on_disk if f.endswith(('.png', '.jpg'))]
# only three non-webp files are allowed: textures/art where WebP came out bigger, and the PWA icon
assert set(raster) <= {'assets/base/grass.jpg', 'assets/turf/grey-pack.jpg', 'assets/wolf.jpg'}, f'png/jpg left: {sorted(set(raster))[:8]}'
total_kb = sum(os.path.getsize(os.path.join(ROOT, f)) for f in on_disk) / 1024
big = [(f, os.path.getsize(os.path.join(ROOT, f)) // 1024) for f in on_disk if os.path.getsize(os.path.join(ROOT, f)) > 200 * 1024]
print('assets', len(on_disk), 'files', round(total_kb), 'KB; >200KB:', big)
assert total_kb < 12 * 1024, f'assets/ over the 12 MB budget: {total_kb:.0f} KB'
assert not big, f'oversized assets: {big}'
# every literal asset path in the code exists
src = ''.join(open(f).read() for f in glob.glob(os.path.join(ROOT, 'js/**/*.js'), recursive=True) + [os.path.join(ROOT, 'css/style.css'), os.path.join(ROOT, 'index.html'), os.path.join(ROOT, 'manifest.webmanifest')])
lits = set(re.findall(r'assets/[A-Za-z0-9_\-/]+\.(?:webp|png|jpg)', src))
missing = [p for p in lits if not os.path.exists(os.path.join(ROOT, p))]
print('literal asset paths', len(lits), 'missing', missing); assert not missing, missing
# templated paths: rig parts + classic idles + base sprites
rig = open(os.path.join(ROOT, 'js/ui/rig.js')).read(); assert "${id}-${part}.webp" in rig
for f in glob.glob(os.path.join(ROOT, 'assets/actors/*-idle.webp')): pass
assert len(glob.glob(os.path.join(ROOT, 'assets/actors/*-idle.webp'))) >= 17
assert len(glob.glob(os.path.join(ROOT, 'assets/actors/parts/*.webp'))) >= 170
# no per-frame shadowBlur / gradient rebuilds left in the hot battle + base paths
iso = open(os.path.join(ROOT, 'js/ui/iso.js')).read()
draw_iso = iso[iso.index('  draw(ts = performance.now()) {'):iso.index('  diamond(')]
assert 'shadowBlur' not in draw_iso and 'createLinearGradient' not in draw_iso and 'createRadialGradient' not in draw_iso, 'base idle frame still blurs/builds gradients'
yard = open(os.path.join(ROOT, 'js/ui/yard.js')).read()
live = yard[yard.index('export function drawYardLive'):yard.index('// ---------- v0.16 night-city atmosphere')]
assert 'createRadialGradient' not in live and 'createLinearGradient' not in live, 'light pools rebuild gradients per frame'
act = open(os.path.join(ROOT, 'js/ui/actors.js')).read()
db = act[act.index('function drawBase('):act.index('function drawFigurine(')]
assert 'baseSprite(' in db and 'drawBaseTop' not in db, 'figurine bases are not cached'

# ---------------- medic emblems: green, not a red cross ----------------
from PIL import Image
import numpy as np
def emblem(path, box, rmin, kg, kb):
    a = np.array(Image.open(os.path.join(ROOT, path)).convert('RGBA')).astype(int); h, w = a.shape[:2]
    c = a[int(box[1] * h):int(box[3] * h), int(box[0] * w):int(box[2] * w)]
    r, g, b, al = c[..., 0], c[..., 1], c[..., 2], c[..., 3]
    return int(((r > rmin) & (r > g * kg) & (r > b * kb) & (al > 128)).sum()), int(((g > 30) & (g > r * 1.5) & (g > b * 1.2) & (al > 128)).sum())
# (the v0.17 art scored 338 / 972 red px in these boxes)
for path, box, th in [('assets/actors/pact-fig.webp', (0.15, 0.55, 0.35, 0.68), (120, 3, 3)), ('assets/heroes/stitch.webp', (0.80, 0.58, 0.91, 0.69), (25, 1.9, 2.2))]:
    n, g = emblem(path, box, *th); print('emblem', path, 'red', n, 'green', g)
    assert n < 100 and g > 400, f'{path}: medic emblem not green ({n} red px, {g} green px)'

with sync_playwright() as p:
    br = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    # ---------------- first load: requests, budget, 404s ----------------
    ctx = br.new_context(viewport={'width': 844, 'height': VH}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg = ctx.new_page(); cdp = ctx.new_cdp_session(pg); cdp.send('Network.enable'); cdp.send('Network.setCacheDisabled', {'cacheDisabled': True})
    reqs = {}
    cdp.on('Network.responseReceived', lambda e: reqs.setdefault(e['requestId'], {}).update(url=e['response']['url'], type=e['type'], status=e['response']['status']))
    cdp.on('Network.loadingFinished', lambda e: reqs.setdefault(e['requestId'], {}).update(bytes=e['encodedDataLength']))
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('response', lambda r: bad.append(f'{r.status} {r.url}') if r.status >= 400 else None)
    pg.goto(URL + '?reset=1&fast=1'); pg.wait_for_selector('#basecv'); pg.wait_for_load_state('networkidle'); pg.wait_for_timeout(300)
    rs = [r for r in reqs.values() if 'url' in r]
    img = [r for r in rs if r['url'].split('?')[0].rsplit('.', 1)[-1] in ('png', 'jpg', 'webp')]
    load = {'requests': len(rs), 'kb': round(sum(r.get('bytes', 0) for r in rs) / 1024), 'img': len(img), 'img_kb': round(sum(r.get('bytes', 0) for r in img) / 1024)}
    print('first load', load)
    assert load['img_kb'] <= 450, f'first-load images over budget: {load}'
    assert load['img'] <= 30, f'too many images on first load: {load}'
    assert load['requests'] <= 100, f'too many requests on first load: {load}'
    assert not any('editor.js' in r['url'] for r in rs), 'editor.js should load on demand'
    lazy_base = [r['url'] for r in img if '/assets/base/' in r['url'] and not re.search(r'/(ground|grass|asphalt)\.', r['url'])]
    placed = pg.evaluate("(async()=>{const I=await import('./js/ui/iso.js'); return I.spriteNames(window.__game.state)})()")
    print('base sprites fetched', len(lazy_base), 'placed', len(placed)); assert len(lazy_base) <= len(placed) + 1, 'base sprites are not lazy'
    ctx.close()

    # ---------------- every screen: no broken images, lazy attributes ----------------
    ctx = br.new_context(viewport={'width': 844, 'height': VH}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg = ctx.new_page(); cdp = ctx.new_cdp_session(pg); cdp.send('Performance.enable')
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('response', lambda r: bad.append(f'{r.status} {r.url}') if r.status >= 400 else None)
    pg.goto(URL + '?reset=1&fast=1&level=16'); pg.wait_for_selector('#basecv'); pg.wait_for_timeout(900); close(pg)
    pg.evaluate("localStorage.setItem('fangcity.hints', JSON.stringify({move:1,target:1,end:1}))")
    CHECK = """async()=>{const imgs=[...document.querySelectorAll('img')]; const lazy=imgs.filter(i=>i.loading==='lazy').length; for (const i of imgs) { i.loading='eager'; } 
      await Promise.all(imgs.map(i=>i.complete?0:new Promise(r=>{i.onload=i.onerror=r; setTimeout(r,3000)})));
      const broken=imgs.filter(i=>!i.naturalWidth).map(i=>i.getAttribute('src'));
      const bg=[...document.querySelectorAll('[style*="background-image"]')].map(e=>(e.getAttribute('style').match(/url\\(([^)]+)\\)/)||[])[1]).filter(Boolean);
      const bgBad=[]; for (const u of new Set(bg)) { const ok=await new Promise(r=>{const im=new Image(); im.onload=()=>r(1); im.onerror=()=>r(0); im.src=u.replace(/['"]/g,'');}); if(!ok) bgBad.push(u); }
      return {n:imgs.length, lazy, broken, bg:bg.length, bgBad}}"""
    tot_lazy = tot_img = 0
    screens = [('base', None), ('crew', None), ('missions', None), ('city', None), ('shop', None), ('jobs', None)]
    for tab, _ in screens:
        if not pg.query_selector(f'[data-act="nav"][data-tab="{tab}"]'):
            print('skip tab', tab); continue
        pg.evaluate(f"document.querySelector('[data-act=\"nav\"][data-tab=\"{tab}\"]').click()"); pg.wait_for_timeout(500)
        r = pg.evaluate(CHECK); print(tab, r); tot_lazy += r['lazy']; tot_img += r['n']
        assert not r['broken'] and not r['bgBad'], f'{tab}: broken images {r}'
        close(pg)
    # an operator sheet (gear grid + item icons) and an operator info modal
    pg.evaluate("document.querySelector('[data-act=\"nav\"][data-tab=\"crew\"]').click()"); pg.wait_for_timeout(400)
    pg.evaluate("document.querySelector('[data-act=\"openHero\"]').click()"); pg.wait_for_timeout(600)
    r = pg.evaluate(CHECK); print('hero sheet', r); tot_lazy += r['lazy']; tot_img += r['n']; assert not r['broken'] and not r['bgBad'], r
    pg.evaluate("document.querySelector('[data-act=\"nav\"][data-tab=\"crew\"]').click()"); pg.wait_for_timeout(400)
    if pg.query_selector('[data-act="heroInfo"]'):
        pg.evaluate("document.querySelector('[data-act=\"heroInfo\"]').click()"); pg.wait_for_timeout(500)
        r = pg.evaluate(CHECK); print('locked operator info', r); assert not r['broken'], r; close(pg)
    print('img total', tot_img, 'lazy', tot_lazy); assert tot_img and tot_lazy >= tot_img * 0.8, 'list/modal images should be lazy'

    # ---------------- base: idle cost, paused under a sheet ----------------
    pg.evaluate("document.querySelector('[data-act=\"nav\"][data-tab=\"base\"]').click()"); pg.wait_for_timeout(900)
    def busy(secs):
        m0 = {m['name']: m['value'] for m in cdp.send('Performance.getMetrics')['metrics']}; t0 = time.time(); pg.wait_for_timeout(int(secs * 1000))
        m1 = {m['name']: m['value'] for m in cdp.send('Performance.getMetrics')['metrics']}
        return round(100 * (m1['TaskDuration'] - m0['TaskDuration']) / (time.time() - t0), 1)
    fs = fstats(pg.evaluate(FRAMES, 3)); cpu = busy(3); print('base', fs, 'cpu', cpu)
    assert fs['p95'] <= 20 and cpu < 5, f'base idle too busy: {fs} cpu {cpu}%'
    n0 = pg.evaluate("window.__base.view.lastDraw"); pg.evaluate("document.querySelector('[data-act=\"openSettings\"]').click()"); pg.wait_for_timeout(300)
    a = pg.evaluate("window.__base.view.lastDraw"); pg.wait_for_timeout(1200); b = pg.evaluate("window.__base.view.lastDraw")
    print('base under sheet: draws', a, b); assert a == b, 'base kept animating under the settings sheet'
    close(pg); pg.wait_for_timeout(600)

    # ---------------- battle: rainy night, full squad, frame timing ----------------
    pg.evaluate("(async()=>{const H=await import('./js/core/heroes.js'); const s=window.__game.state; for (const id of ['pip','lumen']) if(!s.heroes.owned[id]) H.grantHero(s,id);})()")
    pg.evaluate("(()=>{const s=window.__game.state; const own=Object.keys(s.heroes.owned); s.heroes.squad=['rook','anvil','lumen','vesper'].filter(i=>own.includes(i));})()")
    pg.evaluate("document.querySelector('[data-act=\"nav\"][data-tab=\"missions\"]').click()"); pg.wait_for_timeout(400)
    pg.evaluate("window.__game.fast=false")
    pg.evaluate("document.querySelector('[data-act=\"startOp\"][data-id=\"o12\"]').click()")
    pg.wait_for_selector('.twrap'); pg.wait_for_timeout(2500); close(pg)
    for _ in range(80):
        if pg.evaluate("(()=>{const b=window.__game.state.tactics; const a=b.units.find(x=>x.uid===b.acting); return b.side==='player'&&a&&a.side==='player'})()"): break
        pg.wait_for_timeout(300)
    pg.wait_for_timeout(800)
    vig = pg.evaluate("(()=>{const v=document.querySelector('.twrap .tvig'); return v && getComputedStyle(v).backgroundImage})()")
    print('css grade', (vig or '')[:90]); assert vig and 'radial-gradient' in vig, 'vignette layer missing'
    fs = fstats(pg.evaluate(FRAMES, 5)); cpu = busy(3); perf = pg.evaluate("window.__tfx.perf()")
    print('battle', fs, 'cpu', cpu, 'draw', perf)
    assert fs['p50'] <= 17.5 and fs['fps'] >= 50, f'battle frame timing: {fs}'
    pg.mouse.move(422, VH // 2)
    for _ in range(6): pg.mouse.wheel(0, -200); pg.wait_for_timeout(80)
    pg.wait_for_timeout(1500)
    fz = fstats(pg.evaluate(FRAMES, 4)); z = pg.evaluate("window.__game.sub.tactics.cam.z"); print('battle zoom', round(z, 2), fz)
    assert z > 4 and fz['p50'] <= 17.5 and fz['fps'] >= 45, f'zoomed battle frame timing: {fz}'
    # classic style loads its rig parts on demand without a single 404
    pg.evaluate("window.__actors.setUnitStyle('classic')"); pg.wait_for_timeout(2500)
    pg.evaluate("window.__actors.setUnitStyle('fig')"); pg.wait_for_timeout(300)

    # ---------------- save migration: stored .jpg/.png paths -> .webp ----------------
    r = pg.evaluate("""(async()=>{const S=await import('./js/core/state.js'); const s=JSON.parse(JSON.stringify(window.__game.state)); s.crew=s.crew||[];
       s.__probe={img:'assets/boss-magrey.jpg', bg:'assets/turf/iron-claw.jpg', keep:'assets/turf/grey-pack.jpg', ico:'assets/icons/cash-64.png'};
       const m=S.deserialize(JSON.stringify(s), Date.now()); return m && m.__probe})()""")
    print('migrated paths', r)
    assert r and r['img'] == 'assets/boss-magrey.webp' and r['bg'] == 'assets/turf/iron-claw.webp' and r['keep'] == 'assets/turf/grey-pack.jpg' and r['ico'] == 'assets/icons/cash-64.webp', r
    br.close()

print('http errors', bad); assert not bad, bad
print('console errors', errs); assert not errs, errs
print('v018 OK', VH)
