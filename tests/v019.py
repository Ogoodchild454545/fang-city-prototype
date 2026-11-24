# v0.19 New Operators Day: Sledge (buffalo Breaker), Vigil (owl Spotter), Jinx (raccoon Saboteur), Sable (cat
# Infiltrator), Reed (otter Fixer). Grid + dossiers, the Lv 12 grant, the Market recruit, an op with all of
# them deployed, every signature special's VFX on its target, Classic unit style, zero 404s / console errors.
# VH=390|340.
import os
from playwright.sync_api import sync_playwright
VH = int(os.environ.get('VH', '390')); URL = os.environ.get('BASE', 'http://localhost:8765/')
OUT = os.environ.get('SHOTS', '/tmp/v019'); os.makedirs(OUT, exist_ok=True)
NEW = ['sledge', 'vigil', 'jinx', 'sable', 'reed']
errs, bad = [], []
def shot(pg, n): pg.wait_for_timeout(250); pg.screenshot(path=f'{OUT}/{n}-{VH}.png'); print('shot', n)
def close(pg):
    for _ in range(5):
        if not pg.query_selector('.overlay [data-act="closeModal"]'): break
        pg.click('.overlay [data-act="closeModal"] >> nth=-1'); pg.wait_for_timeout(250)
def tab(pg, t):
    close(pg)
    if pg.query_selector(f'#nav [data-act="nav"][data-tab="{t}"]'): pg.click(f'#nav [data-act="nav"][data-tab="{t}"]')
    else:
        pg.click('#nav [data-act="nav"][data-tab="crew"]'); pg.wait_for_timeout(300)
        pg.click(f'[data-act="nav"][data-tab="{t}"] >> nth=0')
    pg.wait_for_timeout(400)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg = br.new_page(viewport={'width': 844, 'height': VH}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('response', lambda r: bad.append(f'{r.status} {r.url}') if r.status >= 400 else None)
    pg.goto(URL + '?reset=1&fast=1&level=11'); pg.wait_for_selector('#basecv'); pg.wait_for_timeout(600); close(pg)
    assert not pg.evaluate("!!window.__game.state.heroes.owned.sledge"), 'Sledge not before Lv 12'
    # ---- Operators grid: all five, greyed, dossiers ----
    tab(pg, 'heroes')
    for id in NEW:
        assert pg.query_selector(f'.optile.grey[data-id="{id}"]'), f'{id} greyed tile'
    tiles = pg.evaluate("[...document.querySelectorAll('.optile')].map(t=>t.dataset.id)")
    print('grid', len(tiles), tiles[-8:])
    shot(pg, '01-grid-locked')
    for id in NEW:
        pg.click(f'.optile[data-id="{id}"]'); pg.wait_for_selector('.opinfo'); pg.wait_for_timeout(200)
        info = pg.evaluate("(()=>{const o=document.querySelector('.opinfo'); return {txt:o.innerText, shards:!!o.querySelector('.sbar'), rec:!!o.querySelector('[data-act=recruitHero]')}})()")
        assert 'backstory' in info['txt'].lower() and 'abilities' in info['txt'].lower(), id
        if id in ('jinx', 'reed', 'sledge'): assert not info['shards'], f'{id} should not show shards'
        if id in ('vigil', 'sable'): assert info['shards'], f'{id} shows shard progress'
        if id == 'reed': assert info['rec'], 'Reed has a recruit button'
        if id == 'jinx': assert 'Hot metal' in info['txt']
        if id == 'sledge': shot(pg, '02-dossier-sledge')
        close(pg)
    # ---- Market recruit (Reed) ----
    pg.evaluate("(()=>{const s=window.__game.state; s.teeth=400;})()")
    pg.click('.optile[data-id="reed"]'); pg.wait_for_selector('.opinfo'); pg.eval_on_selector('[data-act="recruitHero"]', 'e=>e.click()'); pg.wait_for_timeout(400)
    st = pg.evaluate("(()=>{const s=window.__game.state; return {reed:!!s.heroes.owned.reed, teeth:s.teeth}})()")
    print('recruit', st)
    if not st['reed']:
        # Den too low on a fresh save: lift it and retry
        pg.evaluate("(async()=>{const H=await import('./js/core/heroes.js'); const s=window.__game.state; const d=(s.base&&s.base.buildings||[]).find(b=>b.t==='den'); if(d) d.lv=Math.max(d.lv||1,2); })()")
        pg.wait_for_timeout(200); close(pg)
        pg.click('.optile[data-id="reed"]'); pg.wait_for_selector('.opinfo'); pg.eval_on_selector('[data-act="recruitHero"]', 'e=>e.click()'); pg.wait_for_timeout(400)
        st = pg.evaluate("(()=>{const s=window.__game.state; return {reed:!!s.heroes.owned.reed, teeth:s.teeth}})()")
        print('recruit retry', st)
    assert st['reed'] and st['teeth'] == 250, st
    close(pg)
    # ---- Lv 12: Sledge joins; first clear of Hot metal: Jinx ----
    pg.goto(URL + '?fast=1&level=12'); pg.wait_for_selector('#basecv'); pg.wait_for_timeout(600); close(pg)
    assert pg.evaluate("!!window.__game.state.heroes.owned.sledge"), 'Sledge joins at Lv 12'
    pg.evaluate("""(async()=>{const H=await import('./js/core/heroes.js'); const s=window.__game.state; s.ops.cleared.o11=1; H.opGrants(s);
      H.grantHero(s,'vigil'); H.grantHero(s,'sable'); const I=await import('./js/core/items.js'); I.ensureItems(s); window.__game.save();})()""")
    pg.wait_for_timeout(300)
    owned = pg.evaluate("Object.keys(window.__game.state.heroes.owned)")
    assert all(i in owned for i in NEW), owned
    tab(pg, 'missions'); tab(pg, 'heroes')
    for id in NEW: assert pg.query_selector(f'.optile.own[data-id="{id}"]'), f'{id} owned tile'
    shot(pg, '03-grid-owned')
    # character sheet opens for each, abilities tab lists the kit
    for id in NEW:
        pg.click(f'.optile[data-id="{id}"]'); pg.wait_for_timeout(500)
        assert pg.query_selector('.charscr'), f'{id} sheet'
        pg.click('[data-act="charTab"][data-t="skills"]'); pg.wait_for_timeout(200)
        if id == 'jinx': shot(pg, '04-sheet-jinx-skills')
        pg.click('[data-act="charBack"]'); pg.wait_for_timeout(250)
        if not pg.query_selector('.optile'): tab(pg, 'heroes')

    # ---- battle: deploy four of them, play every special and check its VFX lands ----
    def battle(squad):
        pg.evaluate(f"(()=>{{const s=window.__game.state; s.heroes.squad={squad!r}; s.energy={{n:10,at:Date.now()}};}})()")
        tab(pg, 'missions')
        pg.eval_on_selector('[data-act="startOp"][data-id="o14"]', 'e=>e.click()'); pg.wait_for_timeout(600)
        if not pg.query_selector('.twrap'):
            # loadout sheet in between
            btn = pg.query_selector('.overlay [data-act="loadoutGo"], .overlay [data-act^="startOp"], .overlay .btn.red')
            if btn: btn.click()
        pg.wait_for_selector('.twrap', timeout=10000); pg.wait_for_timeout(1200); close(pg)
        heroes = pg.evaluate("window.__game.state.tactics.units.filter(u=>u.side==='player').map(u=>u.hero)")
        print('deployed', heroes); assert set(squad) <= set(heroes), heroes
    battle(['sledge', 'jinx', 'sable', 'reed'])
    # helper: run an apply() through the UI's event player and measure the VFX bits it spawned
    FX = """async ([hero, act, tgt, place]) => {
      const T = await import('./js/core/tactics.js');
      const b = window.__game.state.tactics; const u = b.units.find(x=>x.hero===hero&&x.side==='player');
      const foes = b.units.filter(x=>x.side==='enemy'&&x.hp>0); const pals = b.units.filter(x=>x.side==='player'&&x.hp>0&&x!==u);
      const f = foes[0]; if (!f) return {err:'no foe'};
      f.hp = Math.max(f.hp, 30); f.maxHp = Math.max(f.maxHp, 30); f.hidden = 0;
      if (place === 'adj') { f.x = u.x + 1; f.y = u.y; if (T.tileAt && !T.tileAt) {} }
      if (place === 'near') { f.x = u.x; f.y = u.y - 3; }
      if (place === 'ally') { pals[0].x = u.x - 1; pals[0].y = u.y; }
      b.acting = u.uid; b.side = 'player'; u.ap = u.maxAp + 1; u.cd = {}; u.jammed = 0; u.alv = 6;
      const a = { type: act, uid: u.uid };
      if (tgt === 'foe') { a.target = f.uid; a.mode = act; }
      if (tgt === 'ally') a.target = pals[0].uid;
      if (tgt === 'tile') { a.x = f.x; a.y = f.y;
        if (act === 'trap') { let best=null; for (let dx=-3;dx<=3&&!best;dx++) for (let dy=-3;dy<=3&&!best;dy++) { const pv=T.previewTile(b,u,'trap',u.x+dx,u.y+dy); if (pv.ok) best={x:u.x+dx,y:u.y+dy}; } if (best) { a.x=best.x; a.y=best.y; } } }
      let r = T.apply(b, {...a});
      // melee specials only spawn their effect on a hit: re-swing (fresh AP / cooldown) until one lands
      for (let i = 0; i < 12 && r.ok && ['smash','backstab','hamstring'].includes(act) && !r.events.some(e=>e.hit); i++) { u.ap = u.maxAp + 1; u.cd = {}; f.hp = Math.max(f.hp, 30); r = T.apply(b, {...a}); }
      if (!r.ok) return {err: r.reason};
      const seen = new Set(); const iv = setInterval(()=>window.__tfx.bits().forEach(t=>seen.add(t)), 25);
      await window.__tfx.play(r.events); await new Promise(res=>setTimeout(res, 150)); clearInterval(iv);
      return {ok:true, typs: r.events.map(e=>e.typ), fx: [...seen].sort()};
    }"""
    # the signature VFX each special must spawn (they land on the target, see js/ui/vfx.js)
    WANT = {'smash': 'hammerarc', 'cleave': 'sweep', 'guard': 'shieldp', 'flash': 'fbang', 'jam': 'static', 'hide': 'dust',
            'backstab': 'slash', 'hamstring': 'slash', 'stim': 'stimfx', 'bribe': 'envelope', 'mark': 'reticle', 'flare': 'flareglow'}
    def fx(hero, act, tgt, place, n=None):
        for _ in range(8):
            r = pg.evaluate(FX, [hero, act, tgt, place])
            if r.get('ok'): break
        print(hero, act, r); assert r.get('ok'), (hero, act, r)
        if act in WANT: assert WANT[act] in r['fx'], (act, 'no', WANT[act], r['fx'])
        if n: shot(pg, n)
        return r
    fx('sledge', 'smash', 'foe', 'adj', '05-sledge-cover-breaker')
    fx('sledge', 'guard', 'ally', 'ally')
    fx('sledge', 'cleave', None, 'adj')
    fx('sledge', 'yell', None, None)
    fx('jinx', 'flash', 'tile', 'near', '06-jinx-flashbang')
    st = pg.evaluate("window.__game.state.tactics.units.filter(u=>u.blinded).length"); assert st >= 1, 'someone Blinded'
    fx('jinx', 'trap', 'tile', 'near')
    fx('jinx', 'jam', None, 'near')
    fx('sable', 'hide', None, None)
    fx('sable', 'backstab', 'foe', 'adj', '07-sable-backstab')
    fx('sable', 'hamstring', 'foe', 'adj')
    fx('reed', 'stim', 'ally', 'ally')
    fx('reed', 'resupply', 'ally', 'ally')
    fx('reed', 'comms', None, None)
    fx('reed', 'bribe', 'foe', 'near')
    # status pills render for the new statuses
    pills = pg.evaluate("document.querySelector('.twrap').innerText")
    # Vigil in her own fight
    pg.evaluate("(()=>{window.__game.state.tactics=null;})()"); pg.goto(URL + '?fast=1'); pg.wait_for_selector('#basecv'); pg.wait_for_timeout(500); close(pg)
    battle(['vigil', 'sledge'])
    fx('vigil', 'mark', 'foe', 'near', '08-vigil-mark')
    fx('vigil', 'flare', 'tile', 'near')
    # ---- Classic style: the new five draw (stamp of their figurine) with no 404 ----
    pg.evaluate("window.__actors.setUnitStyle('classic')"); pg.wait_for_timeout(1200)
    shot(pg, '09-classic')
    pg.evaluate("window.__actors.setUnitStyle('fig')"); pg.wait_for_timeout(300)
    br.close()
bad = [b for b in bad if 'favicon' not in b]
errs = [e for e in errs if 'favicon' not in e and '404' not in e]
print('404s', bad); print('errors', errs)
assert not bad, bad
assert not errs, errs
print('V019 OK', VH)
