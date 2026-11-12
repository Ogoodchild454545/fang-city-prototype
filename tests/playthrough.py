# Headless phone-viewport playthrough of the prototype. Drives the real UI with taps.
import asyncio, json, sys, os
from playwright.async_api import async_playwright

BASE = os.environ.get('BASE', 'http://localhost:8765/')
OUT = os.path.join(os.path.dirname(__file__), '..', 'screenshots')
errors = []

async def shot(page, name):
    await page.wait_for_timeout(250)
    await page.screenshot(path=os.path.join(OUT, name + '.png'))
    print('shot', name)

async def tap(page, sel, idx=0):
    loc = page.locator(sel)
    await loc.nth(idx).click()
    await page.wait_for_timeout(80)

async def close_modal(page):
    if await page.locator('.overlay [data-act="closeModal"]').count():
        await page.locator('.overlay [data-act="closeModal"]').last.click()
        await page.wait_for_timeout(150)

async def play_battle(page, label, shot_at_turn=2, max_iter=400):
    """Plays the current battle through UI taps, using the game's own AI to choose player moves."""
    took = False
    import time
    t_end = time.time() + 240
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
            b.meta = bb.meta;
            const u = a.uid ? b.units.find(x => x.uid === a.uid) : null;
            const t = a.target ? b.units.find(x => x.uid === a.target) : null;
            return {a, u: u && {x: u.x, y: u.y}, t: t && {x: t.x, y: t.y}, turn: b.turn};
        }""")
        if st.get('done'):
            break
        if st.get('wait'):
            await page.wait_for_timeout(60)
            continue
        if not took and st['turn'] >= shot_at_turn:
            await shot(page, label + '-midfight'); took = True
        a = st['a']
        actions += 1
        cell = lambda p: f'.cell[data-x="{p["x"]}"][data-y="{p["y"]}"]'
        if a['type'] == 'end':
            await tap(page, '[data-act="endTurn"]')
            continue
        await page.locator(cell(st['u'])).click()  # select unit
        await page.wait_for_timeout(40)
        if a['type'] == 'move':
            await page.locator(cell(a)).click()
        elif a['type'] == 'attack':
            mode = a.get('mode', 'shot')
            if mode in ('aimed', 'throw'):
                await page.locator(f'[data-act="bmode"][data-mode="{mode}"]').click()
            await page.locator(cell(st['t'])).click()
        elif a['type'] == 'suppress':
            await page.locator('[data-act="bmode"][data-mode="suppress"]').click()
            await page.locator(cell(st['t'])).click()
        elif a['type'] == 'patch':
            await page.locator('[data-act="bmode"][data-mode="patch"]').click()
            await page.locator(cell(st['t'])).click()
        elif a['type'] == 'gadget':
            m = await page.locator('[data-act="bmode"][data-mode="instant"]').count()
            if m: await page.locator('[data-act="bmode"][data-mode="instant"]').click()
            else:
                await page.locator('[data-act="bmode"][data-mode="heal"]').click()
                await page.locator(cell(st['t'] or st['u'])).click()
        await page.wait_for_timeout(60)
        if os.environ.get('DEBUG'):
            print('  act', a, await page.locator('.toast').all_inner_texts())
    try:
        await page.wait_for_selector('.result', timeout=20000)
    except Exception:
        await page.screenshot(path='/tmp/fail.png')
        print('FAIL STATE', await page.evaluate("JSON.stringify({tab: window.__game.tab, battle: !!window.__game.state.battle, last: window.__game.state.lastResult})"))
        print('ERRORS', errors)
        raise
    await shot(page, label + '-result')
    res = await page.locator('.result .big').inner_text()
    await close_modal(page)
    return res

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = await browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        page = await ctx.new_page()
        page.set_default_timeout(10000)
        page.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        page.on('console', lambda m: m.type == 'error' and errors.append('console: ' + m.text))

        # splash (no fast flag) then reset
        await page.goto(BASE + '?reset=1')
        await page.wait_for_selector('.splash')
        await shot(page, '01-splash')
        await tap(page, '#play')
        await page.wait_for_selector('.gangpick')
        await tap(page, '[data-act="pickGang"][data-id="grey"]')
        await shot(page, '02-pick-gang')
        await tap(page, '[data-act="startGame"]')
        await page.wait_for_selector('.tapbtn')

        # idle loop
        for _ in range(12): await tap(page, '.tapbtn')
        await page.wait_for_timeout(2500)
        await tap(page, '[data-act="claimObj"]')   # taps objective
        await tap(page, '[data-act="collect"]')
        await tap(page, '[data-act="claimObj"]')   # collect objective
        cash = await page.evaluate('window.__game.state.cash')
        print('cash after taps/collect', cash)
        # buy stall levels with what we have
        for _ in range(6):
            await tap(page, '[data-act="buyRacket"][data-id="stall"]')
        await shot(page, '03-hideout-early')
        lvl = await page.evaluate('window.__game.state.rackets.stall.level')
        assert lvl > 1, 'stall did not level'

        # test cash via the prototype tool, then grow the empire
        await tap(page, '[data-act="nav"][data-tab="shop"]')
        await tap(page, '[data-act="dbgCash"]')
        await tap(page, '[data-act="nav"][data-tab="empire"]')
        await tap(page, '[data-act="setBuyN"][data-n="10"]')
        await tap(page, '[data-act="buyRacket"][data-id="stall"]')
        await tap(page, '[data-act="claimObj"]')
        await tap(page, '[data-act="buyRacket"][data-id="carwash"]')
        await tap(page, '[data-act="claimObj"]')
        await tap(page, '[data-act="buyRacket"][data-id="carwash"]')
        await tap(page, '[data-act="buyRacket"][data-id="phone"]')
        await tap(page, '[data-act="hireLt"][data-id="stall"]')
        await page.wait_for_timeout(1200)
        await shot(page, '04-hideout-rackets')

        # crew
        await tap(page, '[data-act="nav"][data-tab="crew"]')
        await shot(page, '05-crew-roster')
        await tap(page, '.member[data-act="openMember"]')
        await page.wait_for_selector('.detail-hero')
        await shot(page, '06-crew-member')
        await tap(page, '.overlay [data-act="train"]')
        await page.wait_for_timeout(300)
        await tap(page, '.overlay [data-act="skipTrain"]')
        await close_modal(page)
        # armoury: buy + equip
        await tap(page, '[data-act="crewTab"][data-t="armoury"]')
        for g in ['pistol9', 'leather', 'leather', 'leather', 'bat', 'medkit', 'rifle']:
            await tap(page, f'[data-act="buyGear"][data-id="{g}"]')
        await shot(page, '07-armoury')
        await tap(page, '[data-act="crewTab"][data-t="roster"]')
        n = await page.locator('.member').count()
        for i in range(n):
            await page.locator('.member').nth(i).click()
            await page.wait_for_selector('.overlay .detail-hero')
            await page.locator('.overlay [data-act="pickGear"][data-slot="armour"]').click()
            if await page.locator('.overlay [data-act="equip"]').count():
                await page.locator('.overlay [data-act="equip"]').first.click()
            await page.wait_for_timeout(100)
            await close_modal(page)
        armour = await page.evaluate("window.__game.state.crew.map(m=>m.gear.armour)")
        print('armour', armour)
        assert armour.count('leather') >= 3, 'equip failed'
        # recruit (buy teeth in mock shop first)
        await tap(page, '[data-act="nav"][data-tab="shop"]')
        await shot(page, '08-shop')
        await tap(page, '[data-act="buy"][data-kind="teeth"][data-id="t2"]')
        await tap(page, '[data-act="nav"][data-tab="crew"]')
        await tap(page, '[data-act="crewTab"][data-t="recruit"]')
        await shot(page, '09-recruit')
        await tap(page, '[data-act="recruit"][data-type="premium"]')
        await page.wait_for_selector('.result')
        await shot(page, '10-recruit-result')
        await close_modal(page)

        # turf war
        await tap(page, '[data-act="nav"][data-tab="city"]')
        await shot(page, '11-city')
        await tap(page, '[data-act="district"][data-id="rail"]')
        await shot(page, '12-district')
        await tap(page, '[data-act="startDistrict"]')
        await page.wait_for_selector('.board')
        await shot(page, '13-battle-start')
        # select a unit to show highlights
        res1 = await play_battle(page, '14-turf')
        print('turf war result:', res1)

        # raid
        await page.wait_for_selector('[data-act="raid"]')
        await tap(page, '[data-act="raid"]')
        await page.wait_for_selector('.board')
        res2 = await play_battle(page, '15-raid', shot_at_turn=1)
        print('raid result:', res2)

        # jobs
        await tap(page, '[data-act="nav"][data-tab="jobs"]')
        await tap(page, '[data-act="claimDaily"]')
        await shot(page, '16-jobs')

        # offline via reload: rewind clock 3h and reload the page
        await page.evaluate("()=>{const g=window.__game; g.state.lastTick -= 3*3600*1000; g.save();}")
        await page.evaluate("()=>{window.__game.save=()=>{}; }")  # stop overwriting the rewound save
        await page.goto(BASE + '?fast=1')
        await page.wait_for_selector('.result', timeout=5000)
        await shot(page, '17-welcome-back')
        txt = await page.locator('.result').inner_text()
        print('welcome back:', txt.replace('\n', ' | '))
        await tap(page, '[data-act="doubleOffline"]')
        await page.wait_for_timeout(300)

        # battle UI highlight shot: start next district if possible
        await tap(page, '[data-act="nav"][data-tab="city"]')
        await tap(page, '[data-act="district"][data-id="neon"]')
        if not await page.locator('[data-act="startDistrict"]').count():
            await close_modal(page)
            await tap(page, '[data-act="district"][data-id="rail"]')
        if await page.locator('[data-act="startDistrict"]').count():
            await tap(page, '[data-act="startDistrict"]')
            await page.wait_for_selector('.board')
            await page.locator('.cell.reach').first.wait_for()
            await shot(page, '18-battle-move-highlights')
            await tap(page, '[data-act="bmode"][data-mode="aimed"]')
            await shot(page, '19-battle-aimed-mode')
            res3 = await play_battle(page, '20-neon')
            print('neon result:', res3)

        await tap(page, '[data-act="nav"][data-tab="empire"]')
        await shot(page, '21-hideout-later')
        state = await page.evaluate('JSON.stringify(window.__game.state)')
        json.loads(state)  # JSON-serialisable check
        print('state bytes', len(state))
        await browser.close()
    if errors:
        print('ERRORS:'); [print(' ', e) for e in errors]; sys.exit(1)
    print('PLAYTHROUGH OK')

asyncio.run(main())
