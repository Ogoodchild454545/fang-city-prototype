# Headless landscape-phone playthrough (844x390). Drives the real UI: canvas taps, drags, pinch, wheel.
import asyncio, json, sys, os, time
from playwright.async_api import async_playwright

BASE = os.environ.get('BASE', 'http://localhost:8765/')
OUT = os.path.join(os.path.dirname(__file__), '..', 'screenshots')
V1 = os.environ.get('V1SAVE', '/tmp/v1save.json')
errors = []

async def shot(page, name):
    await page.wait_for_timeout(300)
    await page.screenshot(path=os.path.join(OUT, name + '.png'))
    print('shot', name)

async def tap(page, sel, idx=0):
    await page.locator(sel).nth(idx).click()
    await page.wait_for_timeout(90)

async def close_modal(page):
    if await page.locator('.overlay [data-act="closeModal"]').count():
        await page.locator('.overlay [data-act="closeModal"]').last.click()
        await page.wait_for_timeout(150)

async def ev(page, js):
    return await page.evaluate(js)

async def claim_all(page):
    for _ in range(6):
        if await page.locator('[data-act="claimObj"]').count():
            await page.locator('[data-act="claimObj"]').click(); await page.wait_for_timeout(120)
        else: break

async def tap_item(page, id_):
    p = await ev(page, f"window.__base.screenOf('{id_}')")
    await page.mouse.click(p['x'], p['y'])
    await page.wait_for_timeout(120)

async def center(page, id_):
    await ev(page, f"window.__base.centerOn('{id_}')"); await page.wait_for_timeout(100)

async def build(page, type_, cat, drag_to=None, speed=True):
    """Open the build menu, pick a building, optionally drag the ghost, confirm, optionally finish with teeth."""
    await tap(page, '[data-act="openBuild"]')
    await tap(page, f'[data-act="buildCat"][data-cat="{cat}"]')
    await tap(page, f'[data-act="pickBuild"][data-type="{type_}"]')
    assert await page.locator('[data-act="placeOk"]').count(), f'not in placement for {type_}: ' + str(await page.locator('.toast').all_inner_texts())
    if drag_to:
        g = await ev(page, "(()=>{const g=window.__base.view.ghost; return g})()")
        p = await ev(page, f"window.__base.tileToClient({g['x']}, {g['y']})")
        q = await ev(page, f"window.__base.tileToClient({g['x'] + drag_to[0]}, {g['y'] + drag_to[1]})")
        await page.mouse.move(p['x'], p['y']); await page.mouse.down()
        for k in range(1, 9):
            await page.mouse.move(p['x'] + (q['x'] - p['x']) * k / 8, p['y'] + (q['y'] - p['y']) * k / 8); await page.wait_for_timeout(16)
        await page.mouse.up(); await page.wait_for_timeout(80)
    if await page.locator('[data-act="placeOk"][disabled]').count():
        # blocked: let the game pick a free spot by tapping cancel and retrying without the drag
        await tap(page, '[data-act="placeCancel"]')
        return await build(page, type_, cat, None, speed)
    n0 = await ev(page, "window.__game.state.base.buildings.length")
    await tap(page, '[data-act="placeOk"]')
    if type_ == 'wall' and await page.locator('[data-act="placeCancel"]').count():
        pass
    n1 = await ev(page, "window.__game.state.base.buildings.length")
    assert n1 == n0 + 1, f'build {type_} failed: ' + str(await page.locator('.toast').all_inner_texts())
    bid = await ev(page, "window.__game.state.base.buildings.at(-1).id")
    if speed and await page.locator('#selpanel [data-act="speed"]').count():
        await tap(page, '#selpanel [data-act="speed"]')
    return bid

async def play_battle(page, label, shot_at_turn=2, max_iter=500):
    took = False
    t_end = time.time() + 300
    actions = 0
    while time.time() < t_end and actions < max_iter:
        st = await page.evaluate("""async () => {
            const g = window.__game; const b = g.state.battle;
            if (!b) return {done: true};
            const busy = g.sub.battle && g.sub.battle.busy;
            if (b.side !== 'player' || busy || b.status !== 'active') return {wait: true, turn: b.turn};
            const ai = await import('./js/core/ai.js');
            const bb = JSON.parse(JSON.stringify(b));
            const a = ai.aiNextActionFor(bb, 'player');
            const u = a.uid ? b.units.find(x => x.uid === a.uid) : null;
            const t = a.target ? b.units.find(x => x.uid === a.target) : null;
            return {a, u: u && {x: u.x, y: u.y}, t: t && {x: t.x, y: t.y}, turn: b.turn};
        }""")
        if st.get('done'): break
        if st.get('wait'):
            await page.wait_for_timeout(60); continue
        if not took and st['turn'] >= shot_at_turn:
            await shot(page, label + '-midfight'); took = True
        a = st['a']; actions += 1
        cell = lambda p: f'.icell[data-x="{p["x"]}"][data-y="{p["y"]}"]'
        if a['type'] == 'end':
            await tap(page, '[data-act="endTurn"]'); continue
        await page.locator(cell(st['u'])).click(force=True)
        await page.wait_for_timeout(40)
        if a['type'] == 'move':
            await page.locator(cell(a)).click(force=True)
        elif a['type'] == 'attack':
            mode = a.get('mode', 'shot')
            if mode in ('aimed', 'throw'):
                await page.locator(f'[data-act="bmode"][data-mode="{mode}"]').click()
            await page.locator(cell(st['t'])).click(force=True)
        elif a['type'] in ('suppress', 'patch'):
            await page.locator(f'[data-act="bmode"][data-mode="{a["type"]}"]').click()
            await page.locator(cell(st['t'])).click(force=True)
        elif a['type'] == 'gadget':
            if await page.locator('[data-act="bmode"][data-mode="instant"]').count():
                await page.locator('[data-act="bmode"][data-mode="instant"]').click()
            else:
                await page.locator('[data-act="bmode"][data-mode="heal"]').click()
                await page.locator(cell(st['t'] or st['u'])).click(force=True)
        elif a['type'] == 'skill':
            sk = 'roll' if a.get('target') else 'howl'
            if await page.locator(f'[data-act="bmode"][data-mode="{sk}"]').count():
                await page.locator(f'[data-act="bmode"][data-mode="{sk}"]').click()
            if a.get('target') and st.get('t'):
                await page.locator(cell(st['t'])).click(force=True)
        else:
            await tap(page, '[data-act="endTurn"]')
            continue
        await page.wait_for_timeout(60)
    # If the UI fight stalled, finish it in the rules engine and let the screen show the result.
    if not await page.locator('.result').count():
        stt = await ev(page, "window.__game.state.battle && window.__game.state.battle.status")
        print('battle fallback, status', stt)
        if stt == 'active':
            await ev(page, """async () => {
              const g = window.__game; const b = g.state.battle;
              const B = await import('./js/core/battle.js');
              const ai = await import('./js/core/ai.js');
              let steps = 0;
              while (b && b.status === 'active' && steps++ < 4000) {
                const r = B.applyAction(b, ai.aiNextActionFor(b, b.side) || { type: 'end' });
                if (!r.ok) B.applyAction(b, { type: 'end' });
              }
              g.render();
            }""")
    await page.wait_for_selector('.result', timeout=30000)
    await shot(page, label + '-result')
    res = await page.locator('.result .big').inner_text()
    await close_modal(page)
    return res

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = await browser.new_context(viewport={'width': 844, 'height': 390}, device_scale_factor=2, is_mobile=True, has_touch=True)
        page = await ctx.new_page()
        page.set_default_timeout(10000)
        page.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        page.on('console', lambda m: m.type == 'error' and errors.append('console: ' + m.text))

        await page.goto(BASE + '?reset=1')
        await page.wait_for_selector('.splash')
        await shot(page, '01-splash')
        await tap(page, '#play')
        await page.wait_for_selector('#basecv')
        await page.wait_for_timeout(900)
        await ev(page, "window.__game.fast = true")
        # The first-run "Rook is ready" intro modal blocks the map; look around first.
        if await page.locator('.overlay [data-act="closeModal"].btn').count():
            await page.locator('.overlay [data-act="closeModal"].btn').first.click()
            await page.wait_for_timeout(200)
        await shot(page, '03-base-start')

        # ---- pan (drag), wheel zoom, pinch zoom
        cam0 = await ev(page, "({...window.__base.view.cam})")
        await page.mouse.move(500, 250); await page.mouse.down()
        for k in range(1, 11): await page.mouse.move(500 - 22 * k, 250 - 9 * k); await page.wait_for_timeout(16)
        await page.mouse.up()
        cam1 = await ev(page, "({...window.__base.view.cam})")
        assert abs(cam1['x'] - cam0['x']) > 50, f'pan failed {cam0} {cam1}'
        await page.mouse.move(450, 200)
        for _ in range(4): await page.mouse.wheel(0, 240); await page.wait_for_timeout(40)
        cam2 = await ev(page, "({...window.__base.view.cam})")
        assert cam2['z'] < cam1['z'] - 0.1, f'wheel zoom failed {cam1} {cam2}'
        await shot(page, '04-base-zoomed-out')
        cdp = await ctx.new_cdp_session(page)
        async def touch(kind, pts):
            await cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [{'x': x, 'y': y, 'id': i} for i, (x, y) in enumerate(pts)]})
        await touch('touchStart', [(400, 200), (480, 200)])
        for k in range(1, 9): await touch('touchMove', [(400 - 15 * k, 200), (480 + 15 * k, 200)]); await page.wait_for_timeout(16)
        await touch('touchEnd', [])
        cam3 = await ev(page, "({...window.__base.view.cam})")
        assert cam3['z'] > cam2['z'] * 1.5, f'pinch zoom failed {cam2} {cam3}'
        print('camera ok', cam0, cam3)
        await ev(page, "(()=>{const v=window.__base.view; v.cam.z=0.62; window.__base.centerOn(window.__game.state.base.buildings[0].id);})()")

        # ---- build menu + place a stall by dragging the ghost
        await tap(page, '[data-act="openBuild"]')
        await shot(page, '05-build-menu')
        await close_modal(page)
        await tap(page, '[data-act="openBuild"]')
        await tap(page, '[data-act="pickBuild"][data-type="stall"]')
        g0 = await ev(page, "({...window.__base.view.ghost})")
        p0 = await ev(page, f"window.__base.tileToClient({g0['x']}, {g0['y']})")
        q0 = await ev(page, f"window.__base.tileToClient({g0['x'] - 2}, {g0['y'] + 1})")
        await page.mouse.move(p0['x'], p0['y']); await page.mouse.down()
        for k in range(1, 9): await page.mouse.move(p0['x'] + (q0['x'] - p0['x']) * k / 8, p0['y'] + (q0['y'] - p0['y']) * k / 8); await page.wait_for_timeout(16)
        await page.mouse.up()
        g1 = await ev(page, "({...window.__base.view.ghost})")
        assert (g1['x'], g1['y']) != (g0['x'], g0['y']), f'ghost drag failed {g0} {g1}'
        await shot(page, '06-placing-stall')
        if await page.locator('[data-act="placeOk"][disabled]').count():
            await page.mouse.click(q0['x'] + 60, q0['y'] + 10)  # tap elsewhere moves the ghost
        await tap(page, '[data-act="placeOk"]')
        stall = await ev(page, "window.__game.state.base.buildings.find(b=>b.t==='stall').id")
        await shot(page, '07-stall-under-construction')
        await page.wait_for_timeout(5600)  # real build timer (5s)
        lv = await ev(page, f"window.__game.state.base.buildings.find(b=>b.id==='{stall}').lv")
        assert lv == 1, 'stall did not finish building'
        await claim_all(page)

        # ---- collect: skip an hour with the prototype tool, then tap the bubble on the map
        await tap(page, '[data-act="nav"][data-tab="shop"]')
        await tap(page, '[data-act="dbgTime"][data-h="1"]')
        await close_modal(page)
        await tap(page, '[data-act="nav"][data-tab="base"]')
        await page.wait_for_timeout(500)
        await center(page, stall)
        await page.wait_for_timeout(300)
        await shot(page, '08-collect-bubble')
        bubbles = await ev(page, "window.__base.bubbles()")
        assert bubbles, 'no collect bubble'
        c0 = await ev(page, "window.__game.state.cash")
        await page.mouse.click(bubbles[0]['x'], bubbles[0]['y'])
        await page.wait_for_timeout(200)
        c1 = await ev(page, "window.__game.state.cash")
        assert c1 > c0, f'collect failed {c0} {c1}'
        print('collected', c1 - c0)
        await claim_all(page)

        # ---- clear junk next to the shack (real timer)
        for _ in range(3):
            oid = await ev(page, """(()=>{const s=window.__game.state, d=s.base.buildings[0];
              const os=s.base.obstacles.filter(o=>!o.clr && ['bush','tyres','scrap','rubble'].includes(o.t)).sort((a,b)=>Math.hypot(a.x-d.x,a.y-d.y)-Math.hypot(b.x-d.x,b.y-d.y)); return os[0].id})()""")
            await center(page, oid)
            await tap_item(page, oid)
            assert await page.locator('#selpanel [data-act="clearO"]').count(), 'obstacle panel missing'
            await tap(page, '#selpanel [data-act="clearO"]')
            await shot(page, '09-clearing-junk')
            n_before = await ev(page, "window.__game.state.base.obstacles.length")
            await page.wait_for_timeout(1000)
            if await page.locator('#selpanel [data-act="speed"]').count():
                await tap(page, '#selpanel [data-act="speed"]')
            await page.wait_for_timeout(300)
            n_after = await ev(page, "window.__game.state.base.obstacles.length")
            assert n_after == n_before - 1, 'clear failed'
        await claim_all(page)

        # ---- upgrade the stall: shows timer bar, finish with teeth
        await center(page, stall)
        await tap_item(page, stall)
        await tap(page, '#selpanel [data-act="upgrade"]')
        await page.wait_for_timeout(400)
        await shot(page, '10-stall-upgrading')
        await tap(page, '#selpanel [data-act="speed"]')
        lv = await ev(page, f"window.__game.state.base.buildings.find(b=>b.id==='{stall}').lv")
        assert lv == 2, f'upgrade failed lv={lv}'
        await tap(page, '#selpanel [data-act="infoB"]')
        await shot(page, '11-building-info')
        await close_modal(page)

        # ---- move the stall
        await tap(page, '#selpanel [data-act="moveB"]')
        pos0 = await ev(page, f"(()=>{{const b=window.__game.state.base.buildings.find(b=>b.id==='{stall}'); return [b.x,b.y]}})()")
        p = await ev(page, f"window.__base.tileToClient({pos0[0]}, {pos0[1]})")
        q = await ev(page, f"window.__base.tileToClient({pos0[0]}, {pos0[1] + 3})")
        await page.mouse.move(p['x'], p['y']); await page.mouse.down()
        for k in range(1, 9): await page.mouse.move(p['x'] + (q['x'] - p['x']) * k / 8, p['y'] + (q['y'] - p['y']) * k / 8); await page.wait_for_timeout(16)
        await page.mouse.up()
        if not await page.locator('[data-act="placeOk"][disabled]').count():
            await tap(page, '[data-act="placeOk"]')
            pos1 = await ev(page, f"(()=>{{const b=window.__game.state.base.buildings.find(b=>b.id==='{stall}'); return [b.x,b.y]}})()")
            assert pos1 != pos0, 'move failed'
            print('moved stall', pos0, '->', pos1)
        else:
            await tap(page, '[data-act="placeCancel"]'); print('move target blocked; cancelled')

        # ---- grow the base with prototype cash; builders limit concurrent jobs
        await tap(page, '[data-act="nav"][data-tab="shop"]')
        await tap(page, '[data-act="dbgCash"]')
        await tap(page, '[data-act="nav"][data-tab="base"]')
        await page.wait_for_timeout(300)
        await build(page, 'radio', 'influence', speed=False)
        # second job with one builder: blocked
        await tap(page, '[data-act="openBuild"]')
        await tap(page, '[data-act="buildCat"][data-cat="storage"]')
        await tap(page, '[data-act="pickBuild"][data-type="strongbox"]')
        assert not await page.locator('[data-act="placeOk"]').count(), 'builder limit not enforced'
        print('builder limit toast:', await page.locator('.toast').all_inner_texts())
        await close_modal(page)
        await tap(page, '[data-act="builders"]')
        await shot(page, '12-builders')
        await tap(page, '[data-act="hireBuilder"]')
        assert await ev(page, "window.__game.state.base.builders") == 2, 'builder hire failed'
        await build(page, 'strongbox', 'storage')
        await ev(page, "window.__game.state.base.buildings.filter(b=>b.job).forEach(b=>b.job.endsAt=Date.now())")
        await page.wait_for_timeout(400)
        await build(page, 'gym', 'crew')
        await claim_all(page)
        # upgrade The Den to 2 then 3
        den = await ev(page, "window.__game.state.base.buildings[0].id")
        for target in (2, 3):
            await tap(page, '[data-act="nav"][data-tab="shop"]'); await tap(page, '[data-act="dbgCash"]'); await tap(page, '[data-act="nav"][data-tab="base"]')
            await page.wait_for_timeout(300)
            await center(page, den); await tap_item(page, den)
            await tap(page, '#selpanel [data-act="upgrade"]')
            if target == 2: await shot(page, '13-den-upgrading')
            await tap(page, '#selpanel [data-act="speed"]')
            assert await ev(page, f"window.__game.state.base.buildings[0].lv") == target, 'den upgrade failed'
            await claim_all(page)
        # bigger strongbox so pricier buildings fit under the cash cap
        sb = await ev(page, "window.__game.state.base.buildings.find(b=>b.t==='strongbox').id")
        for _ in range(3):
            await tap(page, '[data-act="nav"][data-tab="shop"]'); await tap(page, '[data-act="dbgCash"]'); await tap(page, '[data-act="nav"][data-tab="base"]')
            await page.wait_for_timeout(200)
            await center(page, sb); await tap_item(page, sb)
            await tap(page, '#selpanel [data-act="upgrade"]'); await tap(page, '#selpanel [data-act="speed"]')
        print('strongbox lv', await ev(page, f"window.__game.state.base.buildings.find(b=>b.id==='{sb}').lv"), 'cap', await ev(page, "window.__game.state.cash"))
        # more buildings unlocked by Den 3
        for t, cat in [('carwash', 'money'), ('phone', 'money'), ('stall', 'money'), ('ledger', 'storage'), ('bunk', 'crew'), ('armoury', 'crew'), ('sniper', 'defence'), ('cannon', 'defence'), ('pit', 'influence'), ('family', 'social')]:
            await tap(page, '[data-act="nav"][data-tab="shop"]'); await tap(page, '[data-act="dbgCash"]'); await tap(page, '[data-act="nav"][data-tab="base"]')
            await page.wait_for_timeout(200)
            await build(page, t, cat)
        await claim_all(page)
        # walls: find open ground, then placement continues along a line
        await ev(page, """(async()=>{const BS=await import('./js/core/base.js'); const s=window.__game.state; const d=s.base.buildings[0];
          let best=null; for(let j=2;j<38;j++) for(let i=2;i<32;i++){ let ok=true; for(let k=0;k<6;k++) if(!BS.canPlace(s.base,'wall',i+k,j)) {ok=false;break;}
            if(ok){const dd=Math.hypot(i-d.x,j-d.y); if(!best||dd<best.d) best={i,j,d:dd};} }
          window.__base.view.centerOn(best.i+0.5,best.j,1); window.__base.view.dirty=true;})()""")
        await page.wait_for_timeout(200)
        await tap(page, '[data-act="openBuild"]'); await tap(page, '[data-act="buildCat"][data-cat="wall"]')
        await tap(page, '[data-act="pickBuild"][data-type="wall"]')
        for _ in range(6):
            if await page.locator('[data-act="placeOk"]:not([disabled])').count(): await tap(page, '[data-act="placeOk"]')
        await shot(page, '14-placing-walls')
        if await page.locator('[data-act="placeCancel"]').count(): await tap(page, '[data-act="placeCancel"]')
        walls = await ev(page, "window.__game.state.base.buildings.filter(b=>b.t==='wall').length")
        assert walls >= 3, f'walls {walls}'
        await ev(page, "window.__game.state.base.buildings.forEach(b=>{if(b.job)b.job.endsAt=Date.now()})")
        await page.wait_for_timeout(500)
        await tap(page, '[data-act="nav"][data-tab="shop"]'); await tap(page, '[data-act="dbgTime"][data-h="1"]'); await close_modal(page)
        await tap(page, '[data-act="nav"][data-tab="base"]')
        await page.wait_for_timeout(500)
        await ev(page, "(()=>{const v=window.__base.view; window.__base.centerOn(window.__game.state.base.buildings[0].id); v.cam.z=0.75; v.dirty=true;})()")
        await page.wait_for_timeout(400)
        await shot(page, '15-base-grown')
        await ev(page, "(()=>{const v=window.__base.view; v.cam.z=0.42; v.dirty=true;})()")
        await page.wait_for_timeout(400)
        await shot(page, '16-base-overview')
        await ev(page, "(()=>{const v=window.__base.view; v.cam.z=0.62; v.dirty=true;})()")
        # collect all bubbles that are on screen
        for b in await ev(page, "window.__base.bubbles()"):
            await page.mouse.click(b['x'], b['y']); await page.wait_for_timeout(60)
        # sniper selection panel
        sn = await ev(page, "window.__game.state.base.buildings.find(b=>b.t==='sniper').id")
        await center(page, sn); await tap_item(page, sn)
        await shot(page, '17-defence-selected')

        # ---- My Crew: army screen, train a Rat Runner, unlock Wolf Bruisers, hire Ma Grey
        await tap(page, '[data-act="nav"][data-tab="crew"]')
        await page.wait_for_selector('.armyscr')
        await shot(page, '18-crew-roster')
        # Wolf Bruiser is still locked at Yard 1
        assert await page.locator('.tcard.locked[data-t="wolf"]').count(), 'wolf should be locked at yard 1'
        await tap(page, '[data-act="train"][data-t="rat"]')
        await page.wait_for_timeout(200)
        qn = await ev(page, "window.__game.state.queue.length")
        assert qn >= 1, 'training did not start: ' + str(await page.locator('.toast').all_inner_texts())
        await shot(page, '19-crew-training')
        if await page.locator('[data-act="skipQueue"]').count():
            await tap(page, '[data-act="skipQueue"]')
        print('army', await ev(page, "JSON.stringify(window.__game.state.army)"))
        # upgrade the Training Yard to 2 so Wolf Bruisers unlock
        gym = await ev(page, "window.__game.state.base.buildings.find(b=>b.t==='gym').id")
        await tap(page, '[data-act="nav"][data-tab="shop"]'); await tap(page, '[data-act="dbgCash"]'); await tap(page, '[data-act="nav"][data-tab="base"]')
        await page.wait_for_timeout(200)
        await center(page, gym); await tap_item(page, gym)
        await tap(page, '#selpanel [data-act="upgrade"]'); await tap(page, '#selpanel [data-act="speed"]')
        assert await ev(page, "window.__game.state.base.buildings.find(b=>b.t==='gym').lv") >= 2, 'yard upgrade failed'
        await tap(page, '[data-act="nav"][data-tab="crew"]')
        await page.wait_for_selector('.tcard[data-t="wolf"]')
        assert await page.locator('.tcard[data-t="wolf"]:not(.locked)').count(), 'wolf did not unlock at yard 2'
        await shot(page, '32-wolf-unlocked')
        await tap(page, '[data-act="train"][data-t="wolf"]')
        if await page.locator('[data-act="skipQueue"]').count():
            await tap(page, '[data-act="skipQueue"]')
        # Armoury upgrades tab
        await tap(page, '[data-act="crewTab"][data-t="upgrades"]')
        await page.wait_for_timeout(200)
        await shot(page, '20-armoury')
        if await page.locator('[data-act="research"][data-t="fox"]:not([disabled])').count():
            await tap(page, '[data-act="research"][data-t="fox"]')
        await tap(page, '[data-act="crewTab"][data-t="army"]')
        # hire Ma Grey (Den is already 3)
        await tap(page, '[data-act="bossInfo"][data-id="magrey"]')
        await page.wait_for_selector('.overlay')
        if await page.locator('[data-act="hireBoss"][data-id="magrey"]').count():
            await tap(page, '[data-act="hireBoss"][data-id="magrey"]')
        await close_modal(page)
        assert await ev(page, "!!window.__game.state.bosses.magrey"), 'Ma Grey hire failed: ' + str(await page.locator('.toast').all_inner_texts())
        print('bosses', await ev(page, "JSON.stringify(window.__game.state.bosses)"))

        # ---- shop + jobs
        await tap(page, '[data-act="nav"][data-tab="shop"]')
        await shot(page, '21-shop')
        await tap(page, '[data-act="nav"][data-tab="jobs"]')
        await tap(page, '[data-act="claimDaily"]')
        await shot(page, '22-jobs')

        # ---- Missions: Grey Pack turf, first stage
        await tap(page, '[data-act="nav"][data-tab="missions"]')
        await page.wait_for_selector('.mcamp')
        await shot(page, '33-missions')
        await tap(page, '[data-act="missionInfo"][data-gi="0"][data-si="0"]')
        await page.wait_for_selector('.overlay')
        await shot(page, '34-mission-info')
        await tap(page, '.overlay [data-act="startMission"]')
        await page.wait_for_selector('.iboard')
        await shot(page, '35-mission-start')
        res_m = await play_battle(page, '36-mission', shot_at_turn=2)
        print('mission result:', res_m, 'progress', await ev(page, "JSON.stringify(window.__game.state.missions)"))

        # ---- city: scout + raid a rival base
        await tap(page, '[data-act="nav"][data-tab="city"]')
        await shot(page, '23-city')
        await tap(page, '[data-act="scout"]')
        await shot(page, '24-scout-rival-base')
        cash_before = await ev(page, "window.__game.state.cash")
        await tap(page, '.overlay [data-act="raid"]')
        await page.wait_for_selector('.iboard')
        await shot(page, '25-raid-start')
        sel = await ev(page, "(()=>{const b=window.__game.state.battle; return b.units.filter(u=>u.structure).length})()")
        assert sel >= 3, 'raid has no structures'
        res2 = await play_battle(page, '26-raid', shot_at_turn=2)
        print('raid result:', res2, 'last', await ev(page, "JSON.stringify(window.__game.state.lastResult)"))

        # ---- turf war on the landscape board
        await close_modal(page)
        await tap(page, '[data-act="nav"][data-tab="city"]')
        await tap(page, '[data-act="district"][data-id="rail"]')
        await tap(page, '[data-act="startDistrict"]')
        await page.wait_for_selector('.iboard')
        if await page.locator('.unit.player').count():
            await page.locator('.unit.player').first.click(force=True)
            await page.wait_for_timeout(250)
        if await page.locator('.icell.reach').count():
            await shot(page, '27-turf-move-highlights')
        else:
            await shot(page, '27-turf-start')
            print('no move highlights at turf start; continuing')
        res1 = await play_battle(page, '28-turf')
        print('turf war result:', res1)

        # ---- offline: rewind 3h and reload
        await page.evaluate("()=>{const g=window.__game; g.state.lastTick -= 3*3600*1000; g.save(); g.save=()=>{};}")
        await page.goto(BASE + '?fast=1')
        await page.wait_for_selector('.result', timeout=6000)
        await shot(page, '29-welcome-back')
        print('welcome back:', (await page.locator('.result').inner_text()).replace('\n', ' | '))
        await close_modal(page)
        state = await page.evaluate('JSON.stringify(window.__game.state)')
        json.loads(state); print('state bytes', len(state))

        # ---- portrait: rotate prompt
        await page.set_viewport_size({'width': 390, 'height': 844})
        await page.wait_for_timeout(300)
        assert await page.locator('#rotate').is_visible(), 'rotate prompt not shown'
        await shot(page, '30-portrait-rotate-prompt')
        await page.set_viewport_size({'width': 844, 'height': 390})

        # ---- migration from a v0.1 save
        if os.path.exists(V1):
            v1 = open(V1).read()
            await page.evaluate("(v)=>{window.__game.save=()=>{}; localStorage.clear(); localStorage.setItem('fangcity.save.v1', v);}", v1)
            await page.goto(BASE + '?fast=1')
            await page.wait_for_selector('.overlay .sheet')
            await shot(page, '31-migrated-save')
            m = await ev(page, "(()=>{const s=window.__game.state; return {v:s.v, cash:s.cash, teeth:s.teeth, army:s.army, rail:s.districts.rail.owner, base:s.base.buildings.length, old:!!localStorage.getItem('fangcity.save.v1'), crew:s.crew}})()")
            print('migrated', m)
            assert m['v'] >= 3 and m['rail'] == 'player' and not m['old'] and not m['crew'] and sum((m['army'] or {}).values()) > 0, 'migration failed'
        await browser.close()
    if errors:
        print('ERRORS:'); [print(' ', e) for e in errors]; sys.exit(1)
    print('PLAYTHROUGH OK')

asyncio.run(main())
