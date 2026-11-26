# v0.20 guided intro sample: comic storyboard told through Rook (painted panels, slow pans, captions), the guided
# docks job (Mission 1) on the v0.19.1 tutorial steps, one base build, the scrap-bench craft, Mission 2 (Helix
# strikes back) and the hand-off to Boss's orders. Skip menu, ?intro=1 replay, new-game start, old saves untouched.
import os, re
from playwright.sync_api import sync_playwright
VH = int(os.environ.get('VH', '390')); URL = os.environ.get('BASE', 'http://localhost:8765/')
OUT = os.environ.get('SHOTS', '/tmp/v020'); os.makedirs(OUT, exist_ok=True)
SHOWCASE = os.environ.get('SHOWCASE')
errs, bad = [], []
def shot(pg, n, wait=250):
    pg.mouse.move(2, VH - 2); pg.wait_for_timeout(wait); pg.screenshot(path=f'{OUT}/{n}-{VH}.png')
    if SHOWCASE and VH == 390: pg.screenshot(path=f'{SHOWCASE}/v020-{n}.png')
    print('shot', n)
def hint(pg): return pg.evaluate("window.__tfx && window.__tfx.hint()")
def intro(pg): return pg.evaluate("window.__game.state.intro || null")
def sb(pg): return pg.evaluate("(()=>{const e=document.querySelector('.introsb'); if(!e) return null; return {tag:e.querySelector('.sbtag').innerText, caps:[...e.querySelectorAll('.sbcap')].map(c=>c.innerText), on:e.querySelectorAll('.sbcap.on').length, dots:e.querySelectorAll('.sbdots i').length, next:e.querySelector('.sbnext').innerText, img:getComputedStyle(e.querySelector('.sbimg')).backgroundImage, anim:getComputedStyle(e.querySelector('.sbimg')).animationName}})()")
def tap(pg, sel):
    pg.locator(sel).first.click(); pg.wait_for_timeout(300)
def force_win(pg):
    pg.evaluate("(()=>{const c=window.__game,b=c.state.tactics; for(const u of b.units) if(u.side==='enemy') u.hp=0; b.status='win'; c.render();})()")
    pg.wait_for_selector('.resultov', timeout=8000); pg.wait_for_timeout(600)
def tile_xy(pg, x, y): return pg.evaluate("([x,y])=>window.__tfx.tileXY(x,y)", [x, y])
def new_page(br):
    pg = br.new_page(viewport={'width': 844, 'height': VH}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('response', lambda r: bad.append(f'{r.status} {r.url}') if r.status >= 400 else None)
    return pg
ALL_TEXT = "document.body.innerText"

with sync_playwright() as p:
    br = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])

    # ---------------- 0. a brand-new game (no ?fast) opens on the storyboard; old saves never do ----------------
    pg = new_page(br)
    pg.goto(URL + '?reset=1'); pg.click('#play'); pg.wait_for_selector('.introsb', timeout=8000)
    assert intro(pg)['step'] == 'story'
    pg.wait_for_timeout(2600); s0 = sb(pg); print('new game panel', s0)
    assert s0['dots'] == 9 and s0['on'] == 2 and s0['anim'] == 'kb', s0
    shot(pg, 'storyboard-panel', 600)
    pg.close()
    pg = new_page(br)
    pg.goto(URL + '?reset=1&fast=1'); pg.wait_for_selector('#basecv'); pg.wait_for_timeout(600)
    assert intro(pg) is None and not pg.locator('.introsb').count() and not pg.locator('.introcard').count()
    assert pg.locator('.objcard').count(), 'Boss\'s orders missing on a plain fast game'
    pg.close()

    # ---------------- 1. storyboard: 7 panels, captions reveal, tap reveals then advances ----------------
    pg = new_page(br)
    pg.goto(URL + '?reset=1&intro=1&fast=1'); pg.wait_for_selector('.introsb'); pg.wait_for_timeout(400)
    seen = []
    for i in range(9):
        s = sb(pg); seen.append(s)
        assert len(s['caps']) == 2 and all(len(c) <= 80 for c in s['caps']), s
        assert re.search(r'assets/intro/\d[a-z]?-[a-z]+\.webp', s['img']), s
        if i < 8:
            pg.mouse.click(420, VH // 2); pg.wait_for_timeout(150)
            if sb(pg)['tag'] == s['tag']: pg.mouse.click(420, VH // 2); pg.wait_for_timeout(150)
    text = ' '.join(' '.join(s['caps']) for s in seen)
    print('tags', [s['tag'] for s in seen])
    for must in ['HUMANS', 'GENE DRIVE', 'WAR WITH EACH OTHER', 'FALLOUT KILLED', 'SLIP', 'ICE', 'HELIX', 'VALE', 'RATIONS', 'SLIPPING', 'HALE', 'REBELS', 'ROOK', 'DOCKS']: assert must in text.upper(), must
    assert 'CONTRABAND' not in text.upper() and 'THAW' not in (text + ' '.join(s['tag'] for s in seen)).upper()
    assert seen[-1]['next'].upper().startswith('TAKE THE JOB'), seen[-1]
    # every panel image is served
    for k in ['1-spark', '2b-war', '2-fall', '3-pact', '4-slip', '5-helix', '7b-ration', '6-hire', '7-rook']:
        st = pg.evaluate(f"fetch('assets/intro/{k}.webp').then(r=>r.status)"); assert st == 200, (k, st)
    shot(pg, 'storyboard-last')
    tap(pg, '.sbnext.go')
    pg.wait_for_selector('.twrap')

    # ---------------- 1b. first battle: the fight waits for a spotlight UI tour (AP, bar, actions, End turn, enemy, deselect)
    pg.wait_for_selector('.ttour', timeout=8000); pg.wait_for_timeout(300)
    assert not pg.locator('.thint').count(), 'tips wait while the tour runs'
    caps = []
    for k in range(8):
        if not pg.locator('.ttour').count(): break
        c = pg.locator('.ttourcap').inner_text(); caps.append(c)
        hole = pg.locator('.ttourhole').bounding_box(); assert hole and hole['width'] > 10, hole
        if k == 0: shot(pg, 'tour-ap')
        if k == 2: shot(pg, 'tour-actions')
        tap(pg, '[data-tour="next"]')
    print('tour', [c.split('\n')[1][:50] for c in caps])
    assert len(caps) == 6, caps
    allc = ' '.join(caps).upper()
    for must in ['ACTION POINTS', '1 AP PER TILE', 'UNIT BAR', 'ACTIONS', 'END TURN', 'HOOK', 'DESELECT']: assert must in allc, must
    assert pg.evaluate("JSON.parse(localStorage.getItem('fangcity.hints')||'{}').tour") == 1
    pg.wait_for_timeout(600)

    # ---------------- 2. Mission 1: the docks job, story line first, then the teaching steps ----------------
    b = pg.evaluate("(()=>{const b=window.__game.state.tactics; return {intro:b.intro,label:b.label,kind:b.kind,foes:b.units.filter(u=>u.side==='enemy').map(u=>u.hero)}})()")
    print('m1', b); assert b['intro'] == 1 and b['label'] == 'Docks job' and b['foes'] == ['hook']
    h = hint(pg); print('m1 hint', h)
    assert h and h['id'] == 'intro-m1' and 'Docks, midnight' in h['text'], h
    assert h['rect']['width'] <= 262 and h['rect']['height'] <= 120, h['rect']
    shot(pg, 'mission1-brief')
    tap(pg, '.thint'); h = hint(pg); print('then', h); assert h and h['id'] == 'turn' and 'Action Points (AP)' in h['text'] and '1 AP' in h['text'], h
    assert h['rect']['height'] <= 120, h['rect']
    assert 'AP 4/4' in pg.locator('.taplbl').inner_text()
    shot(pg, 'ap-tip')
    tap(pg, '.thint'); h = hint(pg); print('then', h); assert h and h['id'] == 'move' and 'up close' in h['text'], h
    shot(pg, 'mission1-hint')
    # walk one tile toward Hook through the real preview -> Move here (learns move + cover)
    rook = pg.evaluate("(()=>{const b=window.__game.state.tactics; const r=b.units.find(u=>u.hero==='rook'); return {x:r.x,y:r.y}})()")
    pt = tile_xy(pg, rook['x'] + 1, rook['y']); pg.touchscreen.tap(pt['x'], pt['y']); pg.wait_for_timeout(400)
    h = hint(pg); print('preview hint', h); assert h and h['id'] == 'cover', h
    tap(pg, '[data-act="tmoveGo"]'); pg.wait_for_timeout(800)
    assert pg.evaluate("window.__game.state.tactics.units.find(u=>u.hero==='rook').moved"), 'Move here did not move Rook'
    # bring Hook within Pounce range: the tip names Pounce in plain words and its button pulses
    pg.evaluate("""(async()=>{const T=await import('./js/core/tactics.js'); const c=window.__game,b=c.state.tactics; const r=b.units.find(u=>u.hero==='rook'), h=b.units.find(u=>u.hero==='hook');
      for (const [dx,dy] of [[3,0],[-3,0],[0,3],[0,-3],[2,1],[1,2],[2,-1],[-2,1]]) { const x=r.x+dx,y=r.y+dy; if (T.walkable(b,x,y,h.uid)) { h.x=x; h.y=y; break; } } c.render();})()""")
    pg.wait_for_timeout(500)
    for _ in range(3):
        h = hint(pg)
        if h and h['id'] == 'special': break
        if h: tap(pg, '.thint')
    print('pounce hint', h)
    assert h and h['id'] == 'special' and 'leap attack' in h['text'] and 'up to 4 tiles' in h['text'], h
    assert pg.locator('.tabl.tglow[data-mode="pounce"]').count() == 1, 'Pounce button should pulse'
    shot(pg, 'pounce-tip')
    # press and hold an ability (touch) to read it without picking it
    pg.evaluate("""(()=>{const el=document.querySelector('.tabl[data-mode="secondwind"]'); el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch'}));})()""")
    pg.wait_for_timeout(700)
    tt = pg.locator('.ttip').inner_text() if pg.locator('.ttip').count() else ''
    print('hold tip', tt); assert 'SECOND WIND' in tt.upper() and 'heal' in tt.lower(), tt
    pg.evaluate("document.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerType:'touch'}))")
    assert pg.evaluate("window.__game.sub.tactics.mode") in (None, '', 'melee', 'shot', 'pounce'), 'hold must not pick the ability'
    force_win(pg)
    assert pg.evaluate("window.__game.state.intro.step") == 'base'
    tap(pg, '.resultov [data-act="closeModal"].red, .resultov .btn.red')
    pg.wait_for_selector('.introsb'); pg.wait_for_timeout(400)
    s = sb(pg); print('beat', s); assert s['tag'].upper() == 'AFTER THE JOB' and s['dots'] == 0
    tap(pg, '.sbnext.go')

    # ---------------- 3. base step: build one thing ----------------
    pg.wait_for_selector('.introcard'); pg.wait_for_timeout(500)
    card = pg.locator('.introcard').inner_text(); print('card', card)
    assert 'Knock-off Stall' in card and 'INTRO 2/5' in card.upper()
    assert pg.locator('.bigbtn.introglow[data-act="openBuild"]').count() == 1
    assert not pg.locator('.objcard').count(), 'Boss\'s orders should wait while the intro runs'
    r = pg.locator('.introcard').bounding_box(); assert r['y'] + r['height'] <= VH - 60, r
    shot(pg, 'base-step')
    tap(pg, '.introcard [data-act="openBuild"]')
    tap(pg, '[data-act="buildCat"][data-cat="money"]'); tap(pg, '[data-act="pickBuild"][data-type="stall"]')
    assert 'clear spot' in pg.locator('.introcard').inner_text()
    tap(pg, '[data-act="placeOk"]'); pg.wait_for_timeout(500)
    assert pg.evaluate("window.__game.state.intro.step") == 'craft'
    card = pg.locator('.introcard').inner_text(); print('card', card); assert 'INTRO 3/5' in card.upper()

    # ---------------- 4. scrap bench: craft two, put one on Rook ----------------
    tap(pg, '[data-act="introBench"]'); pg.wait_for_selector('.introbench')
    assert pg.evaluate("window.__game.state.parts") >= 6
    assert pg.locator('.introbench [data-act="introBenchDone"][disabled]').count() == 1
    tap(pg, '[data-act="introCraft"][data-id="leather"]'); tap(pg, '[data-act="introCraft"][data-id="workboots"]')
    assert pg.locator('[data-act="introCraft"][data-id="bat"][disabled]').count() == 1, 'only two crafts'
    stash = pg.evaluate("window.__game.state.stash"); assert stash.get('leather') == 1 and stash.get('workboots') == 1, stash
    assert not pg.locator('[data-act="introEquip"]').count(), 'equipping happens in Rook\'s gear screen'
    assert 'emoji' not in pg.locator('.introbench').inner_html() and pg.locator('.introbench img.iimg').count() >= 3
    shot(pg, 'bench')
    tap(pg, '[data-act="introBenchDone"]')

    # ---------------- 4b. equip, guided through the real gear screen ----------------
    pg.wait_for_selector('.introcard'); assert pg.evaluate("window.__game.state.intro.step") == 'equip'
    card = pg.locator('.introcard').inner_text(); print('card', card); assert 'INTRO 4/5' in card.upper() and 'Leather Jacket' in card
    tap(pg, '.introcard [data-act="openHero"]'); pg.wait_for_selector('.charscr'); pg.wait_for_timeout(300)
    co = pg.locator('.introcoach').inner_text(); print('coach', co); assert 'Jacket' in co and 'slot' in co
    assert pg.locator('.cslot.introglow[data-slot="jacket"]').count() == 1
    shot(pg, 'equip-step')
    tap(pg, '.cslot[data-slot="jacket"]')
    co = pg.locator('.introcoach').inner_text(); print('coach', co); assert 'Leather Jacket' in co
    assert pg.locator('.sitem.introglow[data-id="leather"]').count() == 1
    shot(pg, 'equip-pick')
    tap(pg, '.sitem[data-id="leather"]')
    assert pg.evaluate("window.__game.state.heroes.owned.rook.equip.jacket") == 'leather'
    co = pg.locator('.introcoach').inner_text(); print('coach', co); assert 'HP 16 → 18' in co, co
    shot(pg, 'equip-done')
    tap(pg, '.introcoach [data-act="introEquipDone"]')
    pg.wait_for_selector('.introsb'); assert not pg.locator('.introcoach').count()
    s = sb(pg); print('raid beat', s); assert s['tag'].upper() == 'HELIX TOWER'
    tap(pg, '.sbnext.go')

    # ---------------- 5. Mission 2: Helix strikes back; learned steps stay quiet ----------------
    pg.wait_for_selector('.twrap'); pg.wait_for_timeout(1500)
    b = pg.evaluate("(()=>{const b=window.__game.state.tactics; return {intro:b.intro,label:b.label,pvp:b.pvp,foes:b.units.filter(u=>u.side==='enemy').map(u=>u.hero), jacket:b.units.find(u=>u.hero==='rook').maxHp}})()")
    print('m2', b); assert b['intro'] == 2 and b['label'] == 'Helix strikes back' and not b['pvp'] and len(b['foes']) == 2
    # the raiders may win initiative: wait for Rook's turn
    for _ in range(40):
        if pg.evaluate("(()=>{const b=window.__game.state.tactics; return b.side==='player'})()"): break
        pg.wait_for_timeout(500)
    h = hint(pg); print('m2 hint', h)
    if h and h['id'] == 'intro-m2':
        tap(pg, '.thint'); h = hint(pg); print('m2 next', h)
    assert not h or h['id'] not in ('turn', 'move', 'cover'), 'mission 2 repeats steps already learned'
    shot(pg, 'mission2')
    force_win(pg)
    assert pg.evaluate("window.__game.state.intro.step") == 'done'
    tap(pg, '.resultov .btn.red')
    pg.wait_for_selector('.introsb'); s = sb(pg); print('end beat', s); assert s['tag'].upper() == 'FANG CITY'
    tap(pg, '.sbnext.go'); pg.wait_for_timeout(500)
    assert not pg.locator('.introcard').count() and pg.locator('.objcard').count(), 'Boss\'s orders take over'
    assert 'Contraband' not in pg.evaluate(ALL_TEXT)
    # reload: the intro stays finished
    pg.goto(URL + '?fast=1'); pg.wait_for_selector('#basecv'); pg.wait_for_timeout(500)
    assert not pg.locator('.introsb, .introcard').count() and intro(pg)['step'] == 'done'
    pg.close()

    # ---------------- 6. skip menu: skip the story -> docks job; skip all -> free play ----------------
    pg = new_page(br)
    pg.goto(URL + '?reset=1&intro=1&fast=1'); pg.wait_for_selector('.introsb'); pg.wait_for_timeout(300)
    tap(pg, '.sbskip'); assert pg.locator('.sbmenu').count() == 1
    shot(pg, 'skip-menu')
    tap(pg, '[data-sb="stay"]'); assert not pg.locator('.sbmenu').count()
    tap(pg, '.sbskip'); tap(pg, '[data-sb="skipStory"]')
    pg.wait_for_selector('.twrap'); assert pg.evaluate("window.__game.state.tactics.intro") == 1
    pg.goto(URL + '?reset=1&intro=1&fast=1'); pg.wait_for_selector('.introsb'); pg.wait_for_timeout(300)
    tap(pg, '.sbskip'); tap(pg, '[data-sb="skipAll"]'); pg.wait_for_timeout(500)
    assert intro(pg)['step'] == 'done' and not pg.locator('.introsb').count() and pg.locator('.objcard').count()
    # mid-intro skip from the hideout card
    pg.goto(URL + '?reset=1&intro=1&fast=1'); pg.wait_for_selector('.introsb')
    pg.evaluate("(()=>{const c=window.__game; document.querySelector('.introsb').remove(); c.state.intro.step='craft'; c.render();})()")
    pg.wait_for_selector('.introcard'); tap(pg, '[data-act="introSkip"]'); tap(pg, '[data-act="introSkipYes"]')
    assert intro(pg)['step'] == 'done' and not pg.locator('.introcard').count()
    # ?intro=1 replays on an existing save (lesson already won)
    pg.evaluate("(()=>{const c=window.__game; c.state.heroes.tutorialDone=true; c.save();})()")
    pg.goto(URL + '?intro=1&fast=1'); pg.wait_for_selector('.introsb')
    assert intro(pg) == {'step': 'story', 'crafted': 0, 'replay': 1}, intro(pg)
    pg.close()
    br.close()

bad = [x for x in bad if 'favicon' not in x]
print('404s', bad); print('errors', errs)
assert not bad and not errs
print('V020 OK', VH)
