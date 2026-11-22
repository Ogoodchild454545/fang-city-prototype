# Day-log screenshots of every main screen at 844xVH. TAG=before|v015... OUT=/workspace/shots-day
import os, sys
from playwright.sync_api import sync_playwright
VH = int(os.environ.get('VH', '390')); TAG = os.environ.get('TAG', 'now')
OUT = os.environ.get('OUT', '/workspace/shots-day'); os.makedirs(OUT, exist_ok=True)
URL = os.environ.get('BASE', 'http://localhost:8765/')
errs = []
def close(pg):
    for _ in range(5):
        if not pg.query_selector('.overlay [data-act="closeModal"]'): break
        pg.click('.overlay [data-act="closeModal"] >> nth=-1'); pg.wait_for_timeout(250)
def shot(pg, n): pg.wait_for_timeout(350); pg.screenshot(path=f'{OUT}/{TAG}-{n}-{VH}.png'); print('shot', n)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg = br.new_page(viewport={'width': 844, 'height': VH}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL + '?reset=1&fast=1&level=10'); pg.wait_for_selector('#basecv'); pg.wait_for_timeout(900); close(pg)
    shot(pg, 'base')
    for tab in ('crew', 'heroes', 'missions', 'safehouse', 'shop', 'jobs'):
        ok = pg.evaluate(f"(()=>{{const b=document.querySelector('[data-act=\"nav\"][data-tab=\"{tab}\"]'); if(!b) return false; b.click(); return true}})()")
        if ok: pg.wait_for_timeout(500); close(pg); shot(pg, tab)
    pg.evaluate("(()=>{const s=window.__game.state; s.heroes.squad=['rook','anvil'];})()")
    pg.evaluate("document.querySelector('[data-act=\"nav\"][data-tab=\"missions\"]').click()"); pg.wait_for_timeout(400)
    pg.evaluate("window.__game.fast=false")
    pg.evaluate("document.querySelector('[data-act=\"startOp\"][data-id=\"o5\"]').click()")
    pg.wait_for_selector('.twrap', timeout=10000); pg.wait_for_timeout(2600); close(pg)
    shot(pg, 'battle')
    # a touch on an empty reachable tile two steps east of the acting piece
    d = pg.evaluate("""(()=>{const b=window.__game.state.tactics; const a=b.units.find(x=>x.uid===b.acting); const cv=document.getElementById('tacv'); const r=cv.getBoundingClientRect();
      return {x:r.x+a.anim.devX*r.width/cv.width, y:r.y+a.anim.devY*r.height/cv.height}})()""")
    pg.touchscreen.tap(d['x'] + 70, d['y'] + 18); pg.wait_for_timeout(700)
    shot(pg, 'battle-tap-tile')
    br.close()
print('errors', errs)
