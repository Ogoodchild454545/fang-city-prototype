# v0.10 progression playthrough (844x390 and 844x340): Lv 1 home, tutorial ops, energy,
# level-ups, Rookie Track, gear slots / Best gear, Safehouse (stockpile, jobs), Clinic building, ?level=N.
import asyncio, os, sys
from playwright.async_api import async_playwright

BASE = os.environ.get('BASE', 'http://localhost:8765/')
OUT = os.environ.get('SHOTS', '/workspace/shots-v010')
H = int(os.environ.get('VH', '390'))
errors = []

async def shot(page, name):
    await page.wait_for_timeout(350)
    await page.screenshot(path=os.path.join(OUT, f'{name}-{H}.png'))
    print('shot', name)

async def ev(page, js):
    return await page.evaluate(js)

async def close_modal(page):
    if await page.locator('.overlay [data-act="closeModal"]').count():
        await page.locator('.overlay [data-act="closeModal"]').last.click()
        await page.wait_for_timeout(200)

async def win_fight(page):
    await page.wait_for_selector('.twrap', timeout=8000)
    await page.wait_for_timeout(400)
    await ev(page, """() => { const g = window.__game, b = g.state.tactics;
        b.units.filter(u => u.side === 'enemy').forEach(u => u.hp = 0); b.status = 'win'; g.render(); }""")
    await page.wait_for_selector('.result', timeout=8000)

async def on_screen(page, sel):
    box = await page.locator(sel).first.bounding_box()
    assert box, 'not visible: ' + sel
    assert box['y'] >= 0 and box['y'] + box['height'] <= H + 1 and box['x'] + box['width'] <= 845, f'{sel} off-screen {box}'

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = await browser.new_context(viewport={'width': 844, 'height': H}, device_scale_factor=2, is_mobile=True, has_touch=True)
        page = await ctx.new_page()
        page.set_default_timeout(10000)
        page.on('pageerror', lambda e: errors.append('pageerror: ' + str(e) + ' ' + str(getattr(e, 'stack', ''))[:600]))
        page.on('console', lambda m: m.type == 'error' and errors.append('console: ' + m.text))

        await page.goto(BASE + '?reset=1&fast=1')
        await page.wait_for_selector('#basecv')
        await page.wait_for_timeout(700)
        await close_modal(page)
        s = await ev(page, "(()=>{const s=window.__game.state; return {lv:s.player.lv, e:s.energy.n, v:s.v, eq:s.heroes.owned.rook.equip}})()")
        print('new game', s)
        assert s['lv'] == 1 and s['e'] == 10 and s['v'] == 10 and len(s['eq']) == 4
        # Lv 1: Cash only, locked tabs are greyed teasers, energy in the header
        assert await page.locator('.res.cash').count() == 1
        assert await page.locator('.res.inf').count() == 0 and await page.locator('.res.teeth').count() == 0
        assert await page.locator('.nav button.locked').count() == 3
        await on_screen(page, '.res.energy'); await on_screen(page, '.nextop')
        await shot(page, '01-home-lv1')

        # Ops screen at Lv 1
        await page.locator('#nav [data-act="nav"][data-tab="missions"]').click(); await page.wait_for_timeout(300)
        await shot(page, '02-ops-lv1')
        # the three tutorial ops are free and take Rook to Lv 3
        for op in ['t1', 't2', 't3']:
            await page.locator('#nav [data-act="nav"][data-tab="base"]').click(); await page.wait_for_timeout(250)
            nid = await page.locator('.nextop').get_attribute('data-id')
            assert nid == op, f'next op {nid} != {op}'
            await page.locator('.nextop').click()
            await win_fight(page)
            if op == 't3': await shot(page, '03-result-levelup')
            await close_modal(page)
            await page.wait_for_timeout(300)
            await close_modal(page)
        s = await ev(page, "(()=>{const s=window.__game.state; return {lv:s.player.lv, xp:s.player.xp, e:s.energy.n, cleared:Object.keys(s.ops.cleared)}})()")
        print('after tutorial ops', s)
        assert s['lv'] == 3 and s['e'] == 10, s
        # Lv 3: Rookie Track + stockpile + Market/Ice
        await page.locator('#nav [data-act="nav"][data-tab="base"]').click(); await page.wait_for_timeout(300)
        assert await page.locator('.objcard.track').count() == 1
        assert await page.locator('.res.teeth').count() == 1
        # a regular op costs 1 energy
        nid = await page.locator('.nextop').get_attribute('data-id')
        assert nid == 'o1', nid
        await page.locator('.nextop').click()
        e = await ev(page, "window.__game.state.energy.n")
        assert e == 9, e
        await win_fight(page); await close_modal(page); await page.wait_for_timeout(300); await close_modal(page)
        # stockpile after 5 hours away (clock shift)
        await ev(page, "(()=>{const g=window.__game; g.timeOffset += 5*3600*1000; g.render();})()")
        await page.locator('#nav [data-act="nav"][data-tab="base"]').click(); await page.wait_for_timeout(400)
        await close_modal(page)
        en = await ev(page, "window.__game.state.energy.n")
        assert en == 10, f'energy should refill offline, got {en}'
        await shot(page, '04-home-lv3-track-stockpile')
        print('cash before stockpile', await ev(page, "window.__game.state.cash"))
        await ev(page, "window.__game.state.cash = 100")
        cash0 = 100
        await page.locator('[data-act="collectStockHud"]').click(); await page.wait_for_timeout(200)
        assert await ev(page, "window.__game.state.cash") > cash0
        # Rookie Track modal
        await page.locator('[data-act="openTrack"]').first.click(); await page.wait_for_timeout(300)
        await shot(page, '05-rookie-track')
        assert await page.locator('.tstep').count() == 20
        if await page.locator('.overlay [data-act="claimTrack"]').count():
            await page.locator('.overlay [data-act="claimTrack"]').click(); await page.wait_for_timeout(200)
        await close_modal(page)
        # energy info
        await page.locator('.res.energy').click(); await page.wait_for_timeout(200)
        await close_modal(page)
        # gear slots locked at Rook Lv 1-3 / Best gear teaser
        await page.locator('#nav [data-act="nav"][data-tab="crew"]').click(); await page.wait_for_timeout(300)
        await page.locator('[data-act="openHero"]').first.click(); await page.wait_for_timeout(400)
        nl = await page.locator('.cslot.locked').count()
        print('locked slots at Lv3', nl)
        assert nl > 0
        assert await page.locator('[data-act="charBestLocked"]').count() == 1
        await shot(page, '06-gear-slots-locked')
        await page.locator('[data-act="charBack"]').click(); await page.wait_for_timeout(200)

        # ---- ?level=10 : 4v4 cap, all slots, Best gear; Safehouse with clinic + jobs
        await page.goto(BASE + '?fast=1&level=10')
        await page.wait_for_selector('#basecv'); await page.wait_for_timeout(600)
        await close_modal(page)
        s = await ev(page, "(()=>{const s=window.__game.state; return {lv:s.player.lv, owned:Object.keys(s.heroes.owned)}})()")
        print('lv10', s)
        assert s['lv'] == 10 and 'vesper' in s['owned']
        await ev(page, "(()=>{const s=window.__game.state; ['carbine','helmet','stabvest','watch','ring','dice','bandolier','machete'].forEach(i=>{s.stash[i]=(s.stash[i]||0)+1}); })()")
        await page.locator('#nav [data-act="nav"][data-tab="crew"]').click(); await page.wait_for_timeout(300)
        await page.locator('[data-act="openHero"]').first.click(); await page.wait_for_timeout(300)
        assert await page.locator('.cslot.locked').count() == 0
        await page.locator('[data-act="charBest"]').click(); await page.wait_for_timeout(300)
        n = await ev(page, "Object.keys(window.__game.state.heroes.owned.rook.equip).length")
        print('rook equipped after Best gear', n)
        assert n >= 10
        await shot(page, '07-gear-best')
        await page.locator('[data-act="charBack"]').click(); await page.wait_for_timeout(200)
        # KO Vesper in an op -> clinic; send Rook... keep one home; send Vesper? she is in clinic, so give a 3rd operator
        await ev(page, "(()=>{const s=window.__game.state; s.heroes.owned.brick={xp:0,lv:1,stars:1,shards:0,perks:[],gear:null}; s.heroes.squad=['rook','vesper','brick'];})()")
        # v0.11: the clinic only works once the Clinic building is up
        await ev(page, """(async()=>{const BS=await import('./js/core/base.js'); const g=window.__game, s=g.state; s.cash=Math.max(s.cash,5000);
            const sp=BS.findFreeSpot(s.base,'clinic'); const r=BS.startBuild(s,'clinic',sp.x,sp.y,g.now()); BS.finishTimers(s,g.now()+1e8); if(!r.ok) console.error('clinic '+r.reason);})()""")
        await page.locator('#nav [data-act="nav"][data-tab="missions"]').click(); await page.wait_for_timeout(300)
        await shot(page, '08-ops-lv10')
        await page.locator('[data-act="startOp"][data-id="o14"]').click()
        await page.wait_for_selector('.twrap')
        await ev(page, """() => { const g = window.__game, b = g.state.tactics;
            b.units.filter(u => u.side === 'enemy').forEach(u => u.hp = 0);
            const v = b.units.find(u => u.hero === 'vesper'); if (v) v.hp = 0; b.status = 'win'; g.render(); }""")
        await page.wait_for_selector('.result')
        await close_modal(page); await page.wait_for_timeout(300); await close_modal(page)
        cl = await ev(page, "window.__game.state.clinic.map(p=>p.hero)")
        print('clinic', cl)
        assert 'vesper' in cl
        await page.locator('#nav [data-act="nav"][data-tab="jobs"]').click(); await page.wait_for_timeout(300)
        await page.locator('[data-act="pickJob"][data-id="debts"]').click(); await page.wait_for_timeout(200)
        await page.locator('.overlay [data-act="sendJob"][data-hero="brick"]').click(); await page.wait_for_timeout(300)
        jobs = await ev(page, "window.__game.state.opJobs.map(j=>j.hero)")
        assert jobs == ['brick'], jobs
        await ev(page, "(()=>{const g=window.__game; g.timeOffset += 2*3600*1000; g.render();})()")
        await page.wait_for_timeout(400)
        await close_modal(page)
        await page.locator('#nav [data-act="nav"][data-tab="jobs"]').click(); await page.wait_for_timeout(300)
        # one more patient and a fresh job so the screenshot shows all three panels in use
        await ev(page, """(async()=>{const P=await import('./js/core/progression.js'); const g=window.__game, s=g.state; P.admit(s,'vesper',g.now()); s.stockpile.at = g.now() - 7*3600*1000; g.render();})()""")
        await page.wait_for_timeout(2500)
        await shot(page, '09-safehouse')
        await page.locator('[data-act="collectOpJob"]').click(); await page.wait_for_timeout(300)
        assert await ev(page, "window.__game.state.opJobs.length") == 0
        # ?level=15 unlocks City / PvP vs copy
        await page.goto(BASE + '?fast=1&level=15')
        await page.wait_for_selector('#basecv'); await page.wait_for_timeout(500)
        await close_modal(page)
        assert await page.locator('.nav button.locked').count() == 0
        await page.locator('#nav [data-act="nav"][data-tab="city"]').click(); await page.wait_for_timeout(300)
        await shot(page, '10-city-lv15')
        await browser.close()
    if errors:
        print('ERRORS:'); [print(' ', e) for e in errors]; sys.exit(1)
    print('PROGRESSION OK', H)

asyncio.run(main())
