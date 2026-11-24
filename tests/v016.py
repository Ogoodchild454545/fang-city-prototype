# v0.16: every operator and rival stands as a painted figurine. Checks all figurine images load,
# battles only fetch the pieces on the board, and takes battle shots. VH=390 or 340.
import os
from playwright.sync_api import sync_playwright
OUT = os.environ.get('OUT', '/workspace/shots-day'); os.makedirs(OUT, exist_ok=True)
VH = int(os.environ.get('VH', '390'))
URL = os.environ.get('BASE', 'http://localhost:8765/')
errs = []
def close(pg):
    for _ in range(4):
        if not pg.query_selector('.overlay [data-act="closeModal"]'): break
        pg.click('.overlay [data-act="closeModal"] >> nth=-1'); pg.wait_for_timeout(250)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg = b.new_page(viewport={'width': 844, 'height': VH}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    loaded = []
    pg.on('request', lambda r: loaded.append(r.url) if '/assets/actors/' in r.url else None)
    pg.goto(URL + '?reset=1&fast=1&level=10'); pg.wait_for_selector('#basecv'); pg.wait_for_timeout(700); close(pg)
    loaded.clear()
    pg.evaluate("(()=>{const s=window.__game.state; const r=s.heroes.owned.rook; for (const h of ['pip','lumen','ivory','marlow']) if(!s.heroes.owned[h]) s.heroes.owned[h]=JSON.parse(JSON.stringify({...r, equip:{}})); s.heroes.squad=['pip','lumen','ivory','marlow'];})()")
    pg.click('#nav [data-act="nav"][data-tab="missions"]'); pg.wait_for_timeout(400)
    pg.evaluate("document.querySelector('[data-act=\"startOp\"][data-id=\"o5\"]').click()")
    pg.wait_for_selector('.twrap', timeout=10000); pg.wait_for_timeout(1800); close(pg)
    units = pg.evaluate("window.__game.state.tactics.units.map(u=>u.hero)")
    print('units', units)
    idle_png = [u for u in loaded if u.split('?')[0].endswith('-idle.png')]
    print('battle fetched', len(loaded), 'actor files;', len(idle_png), 'idle pngs')
    assert not idle_png, ('fig mode should not fetch classic stamps', idle_png)
    pg.screenshot(path=f'{OUT}/v016-battle-figs-{VH}.png'); print('shot battle')
    for _ in range(3):
        z = pg.query_selector('[data-act="tzoom"][data-z="in"]')
        if z: z.click(); pg.wait_for_timeout(250)
    pg.wait_for_timeout(500); pg.screenshot(path=f'{OUT}/v016-battle-figs-zoom-{VH}.png')
    # zoom in on the squad for a close look
    pg.evaluate("window.__actors.setUnitStyle('classic')"); pg.wait_for_timeout(600)
    pg.screenshot(path=f'{OUT}/v016-battle-classic-{VH}.png')
    pg.evaluate("window.__actors.setUnitStyle('fig')"); pg.wait_for_timeout(500)
    figs = pg.evaluate("Object.keys(window.__actors.FIGS)")
    print('figs', len(figs)); assert len(figs) >= 17, figs
    bad = pg.evaluate("""Promise.all(Object.entries(window.__actors.FIGS).map(([k,f])=>new Promise(r=>{const i=new Image(); i.onload=()=>r(i.naturalWidth>0?null:k); i.onerror=()=>r(k); i.src=f.img;}))).then(a=>a.filter(Boolean))""")
    assert not bad, ('broken figurine art', bad)
    cl = pg.evaluate("new Promise(r=>{const i=new Image(); i.onload=()=>r([i.naturalWidth,i.naturalHeight]); i.onerror=()=>r(null); i.src='assets/base/clinic.webp';})")
    assert cl and cl[0] >= 250, ('clinic sprite', cl)
    print('errors', errs); assert not errs, errs
    b.close()
print('ok')
