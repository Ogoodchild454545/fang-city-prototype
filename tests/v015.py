# v0.15 battle UX: touch move preview (path, AP cost, threats) -> Move -> Undo; attack bar with % and damage;
# mouse click attacks directly; speed toggle 1x/2x; End turn pulses at 0 AP. VH=390|340, OUT=dir
import os
from playwright.sync_api import sync_playwright
VH = int(os.environ.get('VH', '390')); OUT = os.environ.get('OUT', '/workspace/shots-day'); os.makedirs(OUT, exist_ok=True)
URL = os.environ.get('BASE', 'http://localhost:8765/')
errs = []
def close(pg):
    for _ in range(5):
        if not pg.query_selector('.overlay [data-act="closeModal"]'): break
        pg.click('.overlay [data-act="closeModal"] >> nth=-1'); pg.wait_for_timeout(250)
def shot(pg, n): pg.wait_for_timeout(250); pg.screenshot(path=f'{OUT}/v015-{n}-{VH}.png'); print('shot', n)
ACT = """(()=>{const b=window.__game.state.tactics; const a=b.units.find(x=>x.uid===b.acting); const cv=document.getElementById('tacv'); const r=cv.getBoundingClientRect();
  return {x:r.x+a.anim.devX*r.width/cv.width, y:r.y+a.anim.devY*r.height/cv.height, ax:a.x, ay:a.y, ap:a.ap, uid:a.uid}})()"""
with sync_playwright() as p:
    br = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg = br.new_page(viewport={'width': 844, 'height': VH}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.goto(URL + '?reset=1&fast=1&level=10'); pg.wait_for_selector('#basecv'); pg.wait_for_timeout(700); close(pg)
    pg.evaluate("(()=>{const s=window.__game.state; s.heroes.squad=['rook','anvil'];})()")
    pg.evaluate("document.querySelector('[data-act=\"nav\"][data-tab=\"missions\"]').click()"); pg.wait_for_timeout(400)
    pg.evaluate("window.__game.fast=false")
    pg.evaluate("document.querySelector('[data-act=\"startOp\"][data-id=\"o5\"]').click()")
    pg.wait_for_selector('.twrap'); pg.wait_for_timeout(2600); close(pg)
    for _ in range(60):
        if pg.evaluate("(()=>{const b=window.__game.state.tactics; const a=b.units.find(x=>x.uid===b.acting); return b.side==='player'&&a&&a.side==='player'})()"): break
        pg.wait_for_timeout(300)
    d = pg.evaluate(ACT)
    # touch: first tap previews, nothing moves
    for dx, dy in ((60, 12), (-60, 12), (60, -12), (-60, -12), (0, 30)):
        pg.touchscreen.tap(d['x'] + dx, d['y'] + dy); pg.wait_for_timeout(500)
        if pg.query_selector('[data-act="tmoveGo"]'): break
    assert pg.query_selector('[data-act="tmoveGo"]'), 'move preview bar'
    bar = pg.inner_text('.tabar'); print('bar', bar.replace('\n', ' | ')); assert 'AP' in bar
    d1 = pg.evaluate(ACT); assert (d1['ax'], d1['ay'], d1['ap']) == (d['ax'], d['ay'], d['ap']), 'preview must not move'
    shot(pg, 'move-preview')
    pg.click('[data-act="tmoveGo"]'); pg.wait_for_timeout(1800)
    d2 = pg.evaluate(ACT); assert (d2['ax'], d2['ay']) != (d['ax'], d['ay']) and d2['ap'] < d['ap'], 'moved'
    assert pg.query_selector('[data-act="tundo"]'), 'undo offered'
    shot(pg, 'after-move-undo')
    pg.click('[data-act="tundo"]'); pg.wait_for_timeout(1500)
    d3 = pg.evaluate(ACT); assert (d3['ax'], d3['ay'], d3['ap']) == (d['ax'], d['ay'], d['ap']), ('undo restores', d3)
    # speed toggle
    pg.click('[data-act="tspeed"]'); pg.wait_for_timeout(300)
    assert pg.evaluate("localStorage.getItem('fangcity.battleSpeed')") == '2' and '2×' in pg.inner_text('.tspeed')
    pg.click('[data-act="tspeed"]'); pg.wait_for_timeout(200)
    # attack bar on a rival in reach: put a foe 2 tiles away
    pg.evaluate("""(()=>{const b=window.__game.state.tactics; const a=b.units.find(x=>x.uid===b.acting); const e=b.units.find(x=>x.side==='enemy');
       const spots=[[2,0],[0,2],[-2,0],[0,-2],[2,1],[1,2]]; for (const [dx,dy] of spots){const x=a.x+dx,y=a.y+dy; if(!b.units.some(u=>u.x===x&&u.y===y)){e.x=x;e.y=y;break;}} window.__game.render();})()""")
    pg.wait_for_timeout(500)
    e = pg.evaluate("""(()=>{const b=window.__game.state.tactics; const u=b.units.find(x=>x.side==='enemy'); const cv=document.getElementById('tacv'); const r=cv.getBoundingClientRect(); return {x:r.x+u.anim.devX*r.width/cv.width, y:r.y+u.anim.devY*r.height/cv.height, hp:u.hp, uid:u.uid}})()""")
    pg.touchscreen.tap(e['x'], e['y'] - 8); pg.wait_for_timeout(600)
    assert pg.query_selector('[data-act="tconfirm"]'), 'attack button'
    txt = pg.inner_text('.tabatk'); print('atk', txt.replace('\n', ' ')); assert '%' in txt and 'dmg' in txt.lower()
    shot(pg, 'attack-bar')
    pg.click('.tabar [data-act="tconfirm"]'); pg.wait_for_timeout(2500)
    ap = pg.evaluate(ACT)['ap']; assert ap < d['ap'], 'attack spent AP'
    # drain AP and check the End turn pulse
    pg.evaluate("(()=>{const b=window.__game.state.tactics; const a=b.units.find(x=>x.uid===b.acting); if(a.side==='player'){a.ap=0;} window.__game.render();})()")
    pg.wait_for_timeout(400)
    if pg.evaluate("(()=>{const b=window.__game.state.tactics; const a=b.units.find(x=>x.uid===b.acting); return a.side==='player'})()"):
        assert pg.query_selector('[data-act="endTacticsTurn"].pulse'), 'End turn pulses at 0 AP'
        shot(pg, 'end-turn-pulse')
    br.close()
print('errors', errs); assert not errs
print('V015 OK', VH)
