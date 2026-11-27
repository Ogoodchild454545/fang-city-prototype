# v0.22 painted props: close-ups of Docklands props (zoomed in on fixed points of the default view).
# Usage: BASE=http://127.0.0.1:8797/ OUT=/tmp/prop-shots python3 tests/prop_shots.py
import os
from playwright.sync_api import sync_playwright
URL = os.environ.get('BASE', 'http://localhost:8765/'); OUT = os.environ.get('OUT', '/tmp/prop-shots'); VH = int(os.environ.get('VH', '390'))
SPOTS = {'truck': (202, 218), 'van': (424, 107), 'barrier-crates': (270, 200), 'barrels': (150, 262), 'lamp-containers': (556, 262)}
os.makedirs(OUT, exist_ok=True)
def close(pg):
    for _ in range(5):
        if not pg.query_selector('.overlay [data-act="closeModal"]'): break
        pg.click('.overlay [data-act="closeModal"] >> nth=-1'); pg.wait_for_timeout(250)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx = br.new_context(viewport={'width': 844, 'height': VH}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL + '?reset=1&fast=1&level=16'); pg.wait_for_selector('#basecv'); pg.wait_for_timeout(1200); close(pg)
    pg.evaluate("localStorage.setItem('fangcity.hints', JSON.stringify({move:1,target:1,end:1,tour:1,look:1,turn:1,cover:1,special:1,odds:1}))")
    for name, (x, y) in SPOTS.items():
        pg.evaluate("(()=>{const s=window.__game.state; s.energy={n:99,at:Date.now()}; s.tactics=null; s.heroes.squad=Object.keys(s.heroes.owned).slice(0,4);})()")
        pg.evaluate("document.querySelector('[data-act=\"nav\"][data-tab=\"missions\"]').click()"); pg.wait_for_timeout(400)
        pg.evaluate("document.querySelector('[data-act=\"startOp\"][data-id=\"o14\"]').click()")
        pg.wait_for_selector('.twrap', timeout=8000); pg.wait_for_timeout(2200); close(pg)
        for _ in range(40):
            if pg.evaluate("(()=>{const b=window.__game.state.tactics; const a=b&&b.units.find(x=>x.uid===b.acting); return b&&b.side==='player'&&a&&a.side==='player'})()"): break
            pg.wait_for_timeout(250)
        pg.wait_for_timeout(900)
        pg.mouse.move(x, y)
        for _ in range(9): pg.mouse.wheel(0, -200); pg.wait_for_timeout(60)
        pg.wait_for_timeout(1300)
        pg.screenshot(path=f'{OUT}/{name}.png')
        pg.evaluate("(()=>{const g=window.__game; g.state.tactics=null; g.save&&g.save();})()")
        pg.goto(URL + '?fast=1'); pg.wait_for_selector('#basecv'); pg.wait_for_timeout(800); close(pg)
        print(name, 'ok')
    print('errors:', errs[:5])
    br.close()
