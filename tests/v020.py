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
    pg.evaluate("(()=>{const c=window.__game,b=c.state.tactics; if(!b||b.status!=='active') return; for(const u of b.units) if(u.side==='enemy') u.hp=0; b.status='win'; c.render();})()")
    pg.wait_for_selector('.resultov', timeout=8000); pg.wait_for_timeout(600)
def tstate(pg): return pg.evaluate("(()=>{const b=window.__game.state.tactics,u=window.__game.sub.tactics||{};return {spot:u.spot||null,glow:u.glowSel||null,lesson:b&&b.lesson||{},side:b&&b.side,turn:b&&b.turn,status:b&&b.status,units:b?b.units.map(q=>({hero:q.hero,uid:q.uid,side:q.side,x:q.x,y:q.y,hp:q.hp,ap:q.ap})):[]}})()")
def tap_tile(pg, x, y):
    pt = pg.evaluate("([x,y])=>window.__tfx.tileXY(x,y)", [x, y]); pg.touchscreen.tap(pt['x'], pt['y']); pg.wait_for_timeout(450)
def wait_hint(pg, pred, n=30, ms=300):
    h = None
    for _ in range(n):
        h = hint(pg)
        if h and pred(h['id']): return h
        pg.wait_for_timeout(ms)
    return h
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
    kit = pg.evaluate("(()=>{const s=window.__game.state;return {eq:s.heroes.owned.rook.equip,stash:s.stash,flag:s.slotsByHero}})()")
    print('fresh kit', kit); assert kit['eq'] == {'melee': 'tyreiron', 'primary': 'snub'} and kit['stash'] == {} and kit['flag'] == 1, kit
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
    for must in ['PIGS', 'HEARTS AND KIDNEYS', 'TRANSPLANTS', 'SMARTER AND STRONGER', 'CHEAP MUSCLE', 'WORLD WAR THREE', 'NUCLEAR WAR', 'GENE DRIVE', 'FALLOUT', 'EVERY SPECIES', 'SLIP', 'ICE', 'HELIX', 'VALE', 'RATIONS', 'SLIPPING', 'HALE', 'REBELS', 'ROOK', 'DOCKS']: assert must in text.upper(), must
    assert seen[1]['tag'].upper() == 'WORLD WAR THREE' and '2c-nuke' in seen[1]['img'], seen[1]
    assert 'CONTRABAND' not in text.upper() and 'THAW' not in (text + ' '.join(s['tag'] for s in seen)).upper()
    assert seen[-1]['next'].upper().startswith('TAKE THE JOB'), seen[-1]
    # every panel image is served
    for k in ['1-spark', '2c-nuke', '2-fall', '3-pact', '4-slip', '5-helix', '7b-ration', '6-hire', '7-rook']:
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

    # ---------------- 2. Mission 1: after the tour, a step-by-step lesson that waits for the player ----------------
    b = pg.evaluate("(()=>{const b=window.__game.state.tactics; return {intro:b.intro,label:b.label,kind:b.kind,foes:b.units.filter(u=>u.side==='enemy').map(u=>u.hero)}})()")
    print('m1', b); assert b['intro'] == 1 and b['label'] == 'Docks job' and b['foes'] == ['hook']
    rook = [u for u in tstate(pg)['units'] if u['hero'] == 'rook'][0]; hookU = [u for u in tstate(pg)['units'] if u['hero'] == 'hook'][0]
    # (a) the tour ends with Rook put down: pick him up (gold marker on him); the tip can't be waved away
    h = hint(pg); st = tstate(pg); print('lesson', h, st['spot'])
    assert h and h['id'] == 'l-select' and 'Docks, midnight' in h['text'] and st['spot'] == {'x': rook['x'], 'y': rook['y']}, (h, st)
    assert h['rect']['width'] <= 262 and h['rect']['height'] <= 120, h['rect']
    assert pg.locator('.thint.lsn').count() == 1 and '✕' not in h['text']
    shot(pg, 'mission1-brief')
    tap(pg, '.thint'); assert hint(pg)['id'] == 'l-select', 'lesson steps wait for the player'
    tap_tile(pg, rook['x'], rook['y'])
    # (b) blue tiles, 1 AP a tile, a glowing tile behind cover
    h = hint(pg); st = tstate(pg); print('then', h['id'], st['spot']); assert h['id'] == 'l-tiles' and 'blue tiles' in h['text'] and '1 AP' in h['text'] and st['spot'], h
    assert 'AP 4/4' in pg.locator('.taplbl').inner_text()
    shot(pg, 'ap-tip'); shot(pg, 'mission1-step')
    rec = st['spot']; tap_tile(pg, rec['x'], rec['y'])
    # (c) the move preview: cost, cover, Move here pulses
    h = hint(pg); print('then', h); assert h['id'] == 'l-preview' and 'move preview' in h['text'] and 'cover' in h['text'].lower() and 'Move here' in h['text'], h
    assert pg.locator('.tabgo.tglow').count() == 1, 'Move here should pulse'
    shot(pg, 'mission1-preview')
    tap(pg, '.tabgo'); pg.wait_for_timeout(900)
    assert pg.evaluate("window.__game.state.tactics.units.find(u=>u.hero==='rook').moved"), 'Move here did not move Rook'
    # (d) attack: pick Shoot (pulses), aim at Hook (marker), read the hit %, fire
    h = hint(pg); print('then', h); assert h['id'] == 'l-atk-shot' and 'Shoot' in h['text'], h
    assert pg.locator('.tabl.tglow[data-mode="shot"]').count() == 1
    shot(pg, 'mission1-attack')
    tap(pg, '.tabl[data-mode="shot"]')
    h = hint(pg); st = tstate(pg); print('then', h['id'], st['spot']); assert h['id'] == 'l-aim-shot' and st['spot'] == {'x': hookU['x'], 'y': hookU['y']}, (h, st)
    tap_tile(pg, hookU['x'], hookU['y'])
    h = hint(pg); print('then', h); assert h['id'] == 'l-odds-shot' and 'hit chance' in h['text'] and '%' in h['text'], h
    assert pg.locator('.tabatk.tglow').count() == 1
    shot(pg, 'mission1-odds')
    tap(pg, '.tabatk'); pg.wait_for_timeout(1200)
    # (e) End turn pulses; (f) the rival's turn is explained
    h = wait_hint(pg, lambda i: i == 'l-end', 10); print('then', h); assert h and h['id'] == 'l-end' and 'End turn' in h['text'], h
    assert pg.locator('[data-act="endTacticsTurn"].tglow').count() == 1
    tap(pg, '[data-act="endTacticsTurn"]')
    for _ in range(40):
        st = tstate(pg)
        if st['side'] == 'player' and st['turn'] >= 2: break
        pg.wait_for_timeout(300)
    assert st['lesson'].get('enemyShown') and st['lesson'].get('end'), st['lesson']
    # (g) turn 2: Pounce (or Strike if Hook walked up) is taught the same way, its button pulsing
    pg.wait_for_timeout(500)
    h = hint(pg); print('turn 2', h)
    assert h and h['id'] in ('l-atk-pounce', 'l-atk-melee'), h
    if h['id'] == 'l-atk-pounce':
        assert 'leap attack' in h['text'] and 'up to 4 tiles' in h['text'], h
        assert pg.locator('.tabl.tglow[data-mode="pounce"]').count() == 1, 'Pounce button should pulse'
    shot(pg, 'pounce-tip')
    # press and hold an ability (touch) to read it without picking it
    pg.evaluate("""(()=>{const el=document.querySelector('.tabl[data-mode="secondwind"]'); el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch'}));})()""")
    pg.wait_for_timeout(700)
    tt = pg.locator('.ttip').inner_text() if pg.locator('.ttip').count() else ''
    print('hold tip', tt); assert 'SECOND WIND' in tt.upper() and 'heal' in tt.lower(), tt
    pg.evaluate("document.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerType:'touch'}))")
    assert pg.evaluate("window.__game.sub.tactics.mode") != 'secondwind', 'hold must not pick the ability'
    k = h['id'].split('-')[-1]
    tap(pg, f'.tabl[data-mode="{k}"]')
    hk = [u for u in tstate(pg)['units'] if u['hero'] == 'hook'][0]
    tap_tile(pg, hk['x'], hk['y'])
    h = hint(pg); print('then', h); assert h and h['id'] == 'l-odds-' + k, h
    tap(pg, '.tabatk'); pg.wait_for_timeout(1200)
    over = pg.evaluate("(()=>{const b=window.__game.state.tactics; return !b || b.status!=='active'})()")
    assert over or tstate(pg)['lesson'].get('atk-' + k), tstate(pg)['lesson']
    assert all(pg.evaluate(f"JSON.parse(localStorage.getItem('fangcity.hints')||'{{}}')['{i}']") == 1 for i in ['turn', 'move', 'cover', 'odds', 'end', 'look'])
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
    # features the intro hasn't shown yet are locked (dimmed + padlock; a tap only says so)
    assert pg.locator('#nav [data-tab="crew"].introlock').count() == 1 and pg.locator('.nextop.introlock').count() == 1
    tap(pg, '#nav [data-tab="crew"]'); assert pg.evaluate("window.__game.tab") == 'base', 'Crew should be locked during the intro'
    assert pg.locator('.bigbtn.introlock[data-act="openBuild"]').count() == 0, 'Build is open on the build step'
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
    # level 1 Rook: only his weapons, jacket and boots slots are open; the rest show their unlock level
    head = pg.locator('.charscr').inner_text(); print('slots', re.findall(r'\d+/\d+ slots open', head))
    lv = pg.evaluate("window.__game.state.heroes.owned.rook.lv||1")
    want = sum(1 for n in [1,1,1,1,2,2,3,4,6,7,8,10] if n <= lv)
    print('rook level', lv, 'expect open', want)
    assert f'{want}/12 slots open' in head, head[:300]
    assert pg.locator('.charscr').inner_text().count('LV 10') >= 1, 'locked slots show their unlock level'
    assert pg.evaluate("(()=>{const s=window.__game.state,r=s.heroes.owned.rook; return [r.equip.jacket||null, r.equip.boots||null, r.equip.head||null]})()") == [None, None, None]
    assert pg.locator('.cslot.introglow[data-slot="jacket"]').count() == 1
    shot(pg, 'equip-step')
    tap(pg, '.cslot[data-slot="jacket"]')
    co = pg.locator('.introcoach').inner_text(); print('coach', co); assert 'Leather Jacket' in co
    assert pg.locator('.sitem.introglow[data-id="leather"]').count() == 1
    shot(pg, 'equip-pick')
    tap(pg, '.sitem[data-id="leather"]')
    assert pg.evaluate("window.__game.state.heroes.owned.rook.equip.jacket") == 'leather'
    co = pg.locator('.introcoach').inner_text(); print('coach', co); assert re.search(r'HP (\d+) → (\d+)', co) and 'Dodge 0 → 2' in co, co
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
    assert not h or h['id'] not in ('turn', 'move', 'cover') and not h['id'].startswith('l-'), 'mission 2 repeats the basics'
    # advanced notes, each the first time it matters: overwatch (one gun starts on it), flanking, statuses
    pg.evaluate("(()=>{const c=window.__game,b=c.state.tactics; const o=b.units.find(q=>q.side==='enemy'&&q.hp>0); o.overwatch=true; c.render();})()")
    seen_adv = []
    for _ in range(6):
        h = hint(pg)
        if not h: break
        seen_adv.append(h['id'])
        if h['id'] == 'adv-overwatch': break
        tap(pg, '.thint')
    print('m2 notes', seen_adv, h)
    assert h and h['id'] == 'adv-overwatch' and 'Overwatch' in h['text'] and tstate(pg)['spot'], h
    assert h['rect']['height'] <= 120, h['rect']
    shot(pg, 'm2-overwatch')
    tap(pg, '.thint')
    # flanking: put a rival in the open within Rook's gun range and tap him
    fl = pg.evaluate("""(async()=>{const T=await import('./js/core/tactics.js'); const c=window.__game,b=c.state.tactics; const r=b.units.find(u=>u.hero==='rook'); const f=b.units.find(q=>q.side==='enemy'&&q.hp>0);
      for (let d=2; d<=5; d++) for (let dx=-d; dx<=d; dx++) for (const dy of [d-Math.abs(dx), -(d-Math.abs(dx))]) { const x=r.x+dx,y=r.y+dy; if (!T.walkable(b,x,y,f.uid)) continue; const pr=T.previewShot(b,r,{...f,x,y},'shot'); if (pr&&pr.ok&&pr.flanked) { f.x=x; f.y=y; f.overwatch=false; c.render(); return {x,y}; } } return null;})()""")
    print('flank spot', fl); assert fl
    pg.wait_for_timeout(300)
    if hint(pg) and hint(pg)['id'] != 'adv-flank': pass
    tap_tile(pg, fl['x'], fl['y'])
    h = wait_hint(pg, lambda i: i == 'adv-flank', 3)
    for _ in range(4):
        if h and h['id'] == 'adv-flank': break
        if h: tap(pg, '.thint')
        h = hint(pg)
    print('flank', h); assert h and h['id'] == 'adv-flank' and 'Flanked' in h['text'] and '+10%' in h['text'], h
    shot(pg, 'm2-flank')
    tap(pg, '.thint')
    pg.evaluate("(()=>{const c=window.__game,b=c.state.tactics; const o=b.units.find(q=>q.side==='enemy'&&q.hp>0); o.bleed=2; c.sub.tactics.inspect=null; c.render();})()")
    h = None
    for _ in range(5):
        h = hint(pg)
        if not h or h['id'] == 'adv-status': break
        tap(pg, '.thint')
    print('status', h); assert h and h['id'] == 'adv-status' and 'Bleeding' in h['text'], h
    shot(pg, 'mission2')
    force_win(pg)
    assert pg.evaluate("window.__game.state.intro.step") == 'tour'
    tap(pg, '.resultov .btn.red')
    pg.wait_for_selector('.introsb'); s = sb(pg); print('end beat', s); assert s['tag'].upper() == 'FANG CITY' and 'CALL THE SHOTS' not in ' '.join(s['caps']).upper()
    assert s['next'].upper().startswith('LOOK ROUND')
    tap(pg, '.sbnext.go')
    # ---------------- 5b. hideout tour: each feature is shown, then unlocked; it ends on Next op ----------------
    pg.wait_for_selector('.introtour', timeout=8000); pg.wait_for_timeout(300)
    feats = []
    for k in range(20):
        if not pg.locator('.introtour').count(): break
        cap = pg.locator('.ttourcap'); f = cap.get_attribute('data-f'); feats.append(f)
        hole = pg.locator('.ttourhole').bounding_box(); assert hole and hole['width'] > 10, (f, hole)
        assert pg.evaluate(f"window.__game.state.intro.seen['{f}']") == 1, f
        if f == 'den': shot(pg, 'base-tour-den')
        if f == 'crew':
            shot(pg, 'base-tour-crew')
            assert not pg.locator('#nav [data-tab="crew"].introlock').count(), 'crew unlocks as it is explained'
            assert pg.locator('#nav [data-tab="missions"].introlock').count() == 1, 'later features stay locked'
        if f == 'story': shot(pg, 'base-tour-story'); assert 'Next op' in cap.inner_text() and 'story' in cap.inner_text()
        tap(pg, '[data-tour="next"]')
    print('tour', feats)
    for must in ['den', 'stall', 'buildings', 'builders', 'crew', 'ops', 'energy', 'level', 'story']: assert must in feats, must
    assert feats[-1] == 'story'
    assert intro(pg)['step'] == 'done' and not pg.locator('.introlock').count()
    assert pg.locator('.nextop.introglow').count() == 1, 'Next op is left glowing for the story'
    assert not pg.locator('.introcard').count() and pg.locator('.objcard').count(), 'Boss\'s orders take over'
    tap(pg, '#nav [data-tab="crew"]'); assert pg.evaluate("window.__game.tab") == 'crew'
    tap(pg, '#nav [data-tab="base"]'); pg.wait_for_timeout(300)
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
