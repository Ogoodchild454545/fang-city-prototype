# v0.19.1 battle onboarding fixes: compact, state-aware teaching hints (one at a time, at a screen edge clear of
# the action, tap to dismiss), hints never suggest an ability the operator can't afford / is cooling down / is out
# of range, and deselect (tap the piece again, tap empty ground, or the ✕ on the bar) with tap-to-inspect any
# piece while nothing is selected. Move preview, Move here, Undo and the attack bar still work. VH=390|340.
import os
from playwright.sync_api import sync_playwright
VH = int(os.environ.get('VH', '390')); URL = os.environ.get('BASE', 'http://localhost:8765/')
OUT = os.environ.get('SHOTS', '/tmp/v0191'); os.makedirs(OUT, exist_ok=True)
SHOWCASE = os.environ.get('SHOWCASE')  # dir for the showcase frames
errs, bad = [], []
def shot(pg, n):
    pg.wait_for_timeout(250); pg.screenshot(path=f'{OUT}/{n}-{VH}.png')
    if SHOWCASE and VH == 390: pg.screenshot(path=f'{SHOWCASE}/v0191-{n}.png')
    print('shot', n)
def hint(pg): return pg.evaluate("window.__tfx.hint()")
def st(pg): return pg.evaluate("window.__tfx.state()")
def units(pg): return pg.evaluate("window.__game.state.tactics.units.map(u=>({uid:u.uid,hero:u.hero,side:u.side,x:u.x,y:u.y,ap:u.ap,hp:u.hp}))")
def tap_tile(pg, x, y):
    p = pg.evaluate("([x,y])=>window.__tfx.tileXY(x,y)", [x, y]); pg.touchscreen.tap(p['x'], p['y']); pg.wait_for_timeout(350)
def tap_unit(pg, uid):
    p = pg.evaluate("(uid)=>{const b=window.__game.state.tactics; const u=b.units.find(q=>q.uid===uid); return window.__tfx.tileXY(u.x,u.y)}", uid)
    pg.touchscreen.tap(p['x'], p['y'] - 4); pg.wait_for_timeout(350)
SET = """([ap, moved, acted, dist, cd]) => { const b = window.__game.state.tactics; const r = b.units.find(q=>q.hero==='rook'); const h = b.units.find(q=>q.hero==='hook');
  b.acting = r.uid; b.side = 'player'; r.ap = ap; r.moved = moved; r.acted = acted; r.cd = cd ? {pounce: cd} : {};
  // park Hook `dist` tiles straight along a free row from Rook
  for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const x = r.x+dx*dist, y = r.y+dy*dist; if (window.__walk(x,y,h.uid)) { h.x = x; h.y = y; break; } }
  window.__game.render(); return Math.abs(r.x-h.x)+Math.abs(r.y-h.y); }"""

with sync_playwright() as p:
    br = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg = br.new_page(viewport={'width': 844, 'height': VH}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('response', lambda r: bad.append(f'{r.status} {r.url}') if r.status >= 400 else None)
    pg.goto(URL + '?reset=1&fast=1'); pg.wait_for_selector('#basecv'); pg.wait_for_timeout(500)
    pg.evaluate("""(async()=>{const T=await import('./js/core/tactics.js'); window.__T=T; const c=window.__game; c.state.tactics=T.startTutorial(c.state,c.state.rng); c.sub.tactics=null; c.sub.afterBattle='base'; c.go('tactics');
      window.__walk=(x,y,uid)=>T.walkable(c.state.tactics,x,y,uid);})()""")
    pg.wait_for_selector('.twrap'); pg.wait_for_timeout(2000)

    # ---------------- 1. compact, single, edge-placed, dismissable hints; no old wording ----------------
    h = hint(pg); print('first hint', h)
    assert h and h['id'] == 'turn', h
    assert pg.locator('.thint').count() == 1 and pg.locator('.tcoach').count() == 0, 'one hint, no old coach box'
    assert h['rect']['width'] <= 262 and h['rect']['height'] <= 96, h['rect']
    assert h['rect']['top'] < VH * 0.45 or h['rect']['bottom'] > VH - 180, 'hint sits at an edge'
    # never over the acting piece or its target
    for un in units(pg):
        q = pg.evaluate("([x,y])=>window.__tfx.tileXY(x,y)", [un['x'], un['y']]); r = h['rect']
        assert not (r['left'] - 8 < q['x'] < r['right'] + 8 and r['top'] - 8 < q['y'] < r['bottom'] + 30), (un['hero'], q, r)
    body = pg.evaluate("document.querySelector('.twrap').innerText")
    assert 'Bruiser' not in body.split('ROOK')[0] and 'wins up close' not in body, 'old wording gone'
    shot(pg, 'compact-hint')
    pg.click('.thint'); pg.wait_for_timeout(300)
    h2 = hint(pg); print('after dismiss', h2); assert not h2 or h2['id'] != 'turn', 'tap dismisses'
    assert pg.evaluate("JSON.parse(localStorage.getItem('fangcity.hints')||'{}').turn") == 1, 'learned once per device'
    assert h2 and h2['id'] == 'move' and 'up close' in h2['text'], h2  # Rook's lesson line, short and natural

    # ---------------- 2. hints follow AP, cooldown and range ----------------
    pg.evaluate("localStorage.setItem('fangcity.hints', JSON.stringify({turn:1,move:1,cover:1,target:1,odds:1,end:1,look:1}))")
    def texts(args):
        d = pg.evaluate(SET, args); pg.wait_for_timeout(120); x = hint(pg); return d, (x or {}).get('text', '') or ''
    d, t = texts([1, 1, 0, 3, 0]); print('1 AP, dist', d, '->', t)
    assert 'Pounce' not in t, 'no Pounce with 1 AP'
    d, t = texts([0, 1, 1, 3, 0]); print('0 AP ->', t); assert 'Pounce' not in t and 'End turn' in t, t
    d, t = texts([4, 1, 0, 3, 2]); print('cooldown ->', t); assert 'Pounce' not in t, 'no Pounce while recharging'
    d, t = texts([4, 1, 0, 6, 0]); print('out of range', d, '->', t); assert 'Pounce' not in t or d <= 4, t
    d, t = texts([2, 1, 0, 3, 0]); print('ready', d, '->', t); assert 'Pounce' in t, 'ready, affordable and in range: suggested'
    d, t = texts([4, 0, 0, 3, 0]); print('turn start ->', t); assert 'Pounce' in t

    # ---------------- 3. deselect + inspect anything ----------------
    pg.evaluate("localStorage.setItem('fangcity.hints', JSON.stringify({turn:1,move:1,cover:1,target:1,odds:1,end:1,look:1,special:1}))")
    pg.evaluate(SET, [4, 0, 0, 5, 0]); pg.wait_for_timeout(200)
    U = {u['hero']: u for u in units(pg)}
    rook, hook = U['rook'], U['hook']
    assert pg.query_selector('.tdesel'), 'visible ✕ on the selected-unit bar'
    shot(pg, 'deselect-button')
    # (a) the ✕ button
    pg.click('.tdesel'); pg.wait_for_timeout(300)
    s = st(pg); assert s['desel'] == rook['uid'], s
    assert pg.query_selector('.tdock.desel') and not pg.query_selector('.tdesel'), 'slim "is up · tap to select" bar'
    # nothing selected: tapping the rival opens its panel (buffs/debuffs), no attack button
    pg.evaluate("(()=>{const b=window.__game.state.tactics; const h=b.units.find(q=>q.hero==='hook'); h.bleed=2; h.shaken=1; window.__game.render();})()")
    tap_unit(pg, hook['uid'])
    s = st(pg); assert s['inspect'] == hook['uid'] and s['desel'], s
    names = pg.evaluate("[...document.querySelectorAll('#tinsp .tist b')].map(b=>b.firstChild.textContent)"); print('hook statuses', names)
    assert 'Bleeding' in names and not pg.query_selector('.tabatk'), 'status panel, no attack while deselected'
    shot(pg, 'inspect-enemy-deselected')
    # Select brings him back
    pg.click('[data-act="tselect"]'); pg.wait_for_timeout(300); assert not st(pg)['desel']
    # (b) tap the selected piece again: deselects and shows his own buffs
    tap_unit(pg, rook['uid']); s = st(pg); print('tap self', s); assert s['desel'] == rook['uid'] and s['inspect'] == rook['uid'], s
    # a deliberate move tap while deselected is not lost: reselect + preview
    tgt = pg.evaluate("""(()=>{const b=window.__game.state.tactics; const r=b.units.find(q=>q.hero==='rook'); for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]) { const x=r.x+dx, y=r.y+dy; const pth=window.__T.pathTo(b,r,x,y); if (pth && !window.__T.unitAt(b,x,y)) return {x,y}; } return null})()""")
    tap_tile(pg, tgt['x'], tgt['y']); s = st(pg); print('move tap while deselected', s)
    assert not s['desel'] and s['preview'] == tgt, s
    assert pg.query_selector('[data-act="tmoveGo"]'), 'Move here button'
    pg.click('[data-act="tmoveGo"]'); pg.wait_for_timeout(600)
    r2 = next(u for u in units(pg) if u['hero'] == 'rook'); assert (r2['x'], r2['y']) == (tgt['x'], tgt['y']), r2
    assert pg.query_selector('[data-act="tundo"]'), 'Undo still offered'
    pg.click('[data-act="tundo"]'); pg.wait_for_timeout(400)
    r3 = next(u for u in units(pg) if u['hero'] == 'rook'); assert (r3['x'], r3['y']) == (rook['x'], rook['y']), 'undo works'
    # (c) empty ground out of reach: first closes what's open, then deselects
    far = pg.evaluate("""(()=>{const b=window.__game.state.tactics; const r=b.units.find(q=>q.hero==='rook'); const W=innerWidth, H=innerHeight; let best=null;
       for (let y=0; y<b.map.h; y++) for (let x=0; x<b.map.w; x++) { if (window.__T.unitAt(b,x,y) || window.__T.pathTo(b,r,x,y)) continue;
         const p=window.__tfx.tileXY(x,y); if (!p || p.x<140||p.x>W-140||p.y<120||p.y>H-140) continue; const el=document.elementFromPoint(p.x,p.y); if (!el || el.id!=='tacv') continue;
         const d=Math.abs(x-r.x)+Math.abs(y-r.y); if (!best || d<best.d) best={x,y,d}; } return best})()""")
    print('far tile', far)
    if far:
        tap_tile(pg, tgt['x'], tgt['y']); assert st(pg)['preview']
        tap_tile(pg, far['x'], far['y']); s = st(pg); assert not s['preview'] and not s['desel'], ('first tap only clears the preview', s)
        tap_tile(pg, far['x'], far['y']); s = st(pg); assert s['desel'] == rook['uid'], ('then deselects', s)
        pg.click('[data-act="tselect"]'); pg.wait_for_timeout(250)
    # (d) attack bar still works when selected
    pg.evaluate(SET, [4, 1, 0, 1, 0]); pg.wait_for_timeout(200)
    hook = next(u for u in units(pg) if u['hero'] == 'hook'); hp0 = hook['hp']
    tap_unit(pg, hook['uid']); assert pg.query_selector('.tabatk'), 'attack button on the first tap of a rival'
    pg.click('.tabatk'); pg.wait_for_timeout(800)
    assert pg.evaluate("window.__game.state.tactics.units.find(q=>q.hero==='rook').acted"), 'attack went through'
    br.close()
bad = [b for b in bad if 'favicon' not in b]
print('404s', bad); print('errors', errs)
assert not bad and not errs
print('V0191 OK', VH)
