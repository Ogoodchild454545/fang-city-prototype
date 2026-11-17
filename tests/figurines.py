# v0.13 trial: Demeo-style figurines for battle units. Checks the Settings toggle, takes battle shots in
# both styles (before/after), and renders hop / attack / KO frames of Anvil and Rook. VH=390 or 340.
import os
from playwright.sync_api import sync_playwright
OUT = os.environ.get('SHOTS', '/workspace/shots-v013'); os.makedirs(OUT, exist_ok=True)
VH = int(os.environ.get('VH', '390'))
URL = os.environ.get('BASE', 'http://localhost:8765/')
FRAMES = os.environ.get('FRAMES', '1') == '1'
errs = []
def shot(pg, n, **kw): pg.wait_for_timeout(300); pg.screenshot(path=f'{OUT}/{n}-{VH}.png', **kw); print('shot', n)
def close(pg):
    for _ in range(4):
        if not pg.query_selector('.overlay [data-act="closeModal"]'): break
        pg.click('.overlay [data-act="closeModal"] >> nth=-1'); pg.wait_for_timeout(250)
POS = """(()=>{const b=window.__game.state.tactics; const o={}; for (const u of b.units) { const a=u.anim||{}; o[u.hero+'|'+u.side]={x:a.headX,y:a.headY,hp:u.hp,uid:u.uid}; } const cv=document.getElementById('tacv'); const r=cv.getBoundingClientRect(); return {o, r:{x:r.x,y:r.y,w:r.width,h:r.height,cw:cv.width,ch:cv.height}}})()"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg = b.new_page(viewport={'width': 844, 'height': VH}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.goto(URL + '?reset=1&fast=1&level=10'); pg.wait_for_selector('#basecv'); pg.wait_for_timeout(700); close(pg)
    assert pg.evaluate("window.__actors.unitStyle()") == 'fig', 'figurines are the default'
    # Settings toggle round trip
    pg.click('[data-act="openSettings"]'); pg.wait_for_timeout(300)
    assert pg.query_selector('[data-act="setUnitStyle"][data-id="classic"]'), 'toggle in Settings'
    shot(pg, '01-settings-unit-style')
    pg.click('[data-act="setUnitStyle"][data-id="classic"]'); pg.wait_for_timeout(200)
    assert pg.evaluate("localStorage.getItem('fangcity.unitStyle')") == 'classic'
    pg.click('[data-act="setUnitStyle"][data-id="fig"]'); pg.wait_for_timeout(200)
    assert pg.evaluate("window.__actors.unitStyle()") == 'fig'
    close(pg)
    pg.evaluate("(()=>{const s=window.__game.state; s.heroes.squad=['rook','anvil'];})()")
    pg.click('#nav [data-act="nav"][data-tab="missions"]'); pg.wait_for_timeout(400)
    pg.evaluate("document.querySelector('[data-act=\"startOp\"][data-id=\"o5\"]').click()")
    pg.wait_for_selector('.twrap', timeout=10000); pg.wait_for_timeout(1500); close(pg)
    heroes = pg.evaluate("window.__game.state.tactics.units.map(u=>u.hero+':'+u.side)")
    print('units', heroes); assert 'rook:player' in heroes and 'anvil:player' in heroes
    pg.wait_for_timeout(600)
    shot(pg, '02-battle-figurines')
    pg.evaluate("window.__actors.setUnitStyle('classic')"); pg.wait_for_timeout(500)
    shot(pg, '03-battle-classic')
    pg.evaluate("window.__actors.setUnitStyle('fig')"); pg.wait_for_timeout(400)
    if FRAMES:
        # freeze the battle clock and pose each piece by hand: hop, lean-in attack, hit wobble, KO
        DEV = "(uid)=>{const b=window.__game.state.tactics; const u=b.units.find(x=>x.uid===uid); const cv=document.getElementById('tacv'); const r=cv.getBoundingClientRect(); return {x:r.x+u.anim.devX*r.width/cv.width, y:r.y+u.anim.devY*r.height/cv.height, k:r.width/cv.width}}"
        for hero in ('anvil', 'rook'):
            uid = pg.evaluate("(h)=>window.__game.state.tactics.units.find(u=>u.hero===h).uid", hero)
            seq = [('idle', 0)] + [('walk', i / 7) for i in range(8)] + [('melee', i * 0.045) for i in range(10)] + [('hit', i * 0.05) for i in range(8)] + [('ko', i * 0.06) for i in range(12)] + [('ko', 0.7)] * 3
            for i, (clip, t) in enumerate(seq):
                pg.evaluate("""([uid, clip, t])=>{const b=window.__game.state.tactics; const u=b.units.find(x=>x.uid===uid); const a=window.__actors.ensureAnim(u);
                  a.holdPose=true; a.clip=clip; a.t=t; a.muzzle=0; a.flash=(clip==='hit'&&t<0.1)?1:0; a.hop=clip==='walk'?t:null; a.facing=1; }""", [uid, clip, t])
                pg.wait_for_timeout(80)
                d = pg.evaluate(DEV, uid)
                W, H = 150, 150
                x0, y0 = max(0, d['x'] - W / 2), max(0, d['y'] - H + 30)
                pg.screenshot(path=f'/tmp/fr-{VH}-{hero}-{i:02d}.png', clip={'x': x0, 'y': y0, 'width': W, 'height': H})
            pg.evaluate("(uid)=>{const u=window.__game.state.tactics.units.find(x=>x.uid===uid); const a=u.anim; a.holdPose=false; a.clip='idle'; a.hop=null;}", uid)
        # same crop in both styles for the before/after
        for style in ('classic', 'fig'):
            pg.evaluate(f"window.__actors.setUnitStyle('{style}')"); pg.wait_for_timeout(500)
            for hero in ('rook', 'anvil'):
                uid = pg.evaluate("(h)=>window.__game.state.tactics.units.find(u=>u.hero===h).uid", hero)
                pg.evaluate("window.__actors.setUnitStyle('fig')"); pg.wait_for_timeout(120)
                d = pg.evaluate(DEV, uid)
                pg.evaluate(f"window.__actors.setUnitStyle('{style}')"); pg.wait_for_timeout(250)
                pg.screenshot(path=f'/tmp/ba-{VH}-{style}-{hero}.png', clip={'x': max(0, d['x'] - 60), 'y': max(0, d['y'] - 95), 'width': 120, 'height': 115})
        pg.evaluate("window.__actors.setUnitStyle('fig')")
    # play the rest of the op with the AI on both sides so every clip runs for real
    for _ in range(80):
        pg.wait_for_timeout(300)
        if not pg.evaluate("!!window.__game.state.tactics && !window.__game.state.tactics.over"): break
        pg.evaluate("(()=>{const b=window.__game.state.tactics; const u=b && b.units.find(x=>x.uid===b.acting); if (u && u.side==='player') document.querySelector('[data-act=\"endTacticsTurn\"]')?.click();})()")
        if _ == 6 and pg.query_selector('#tacv'): shot(pg, '04-battle-midfight')
    b.close()
bad = [e for e in errs if 'favicon' not in e]
print('errors', bad)
assert not bad
print('FIG OK', VH)
