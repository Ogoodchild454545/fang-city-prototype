# v0.11 playthrough: item art in the inventory, item detail + compare, tap-to-open Clinic and Factory, loot drop tile.
import os, json, time
from playwright.sync_api import sync_playwright
OUT=os.environ.get('SHOTS','/workspace/shots-v011'); os.makedirs(OUT,exist_ok=True)
VH=int(os.environ.get('VH','390'))
URL='http://localhost:8765/'
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':844,'height':VH},device_scale_factor=2)
    pg.on('pageerror',lambda e: errs.append(str(e)))
    pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None)
    pg.goto(URL+'?reset=1&fast=1&level=12'); pg.wait_for_selector('#basecv'); pg.wait_for_timeout(800)
    while pg.query_selector('.overlay [data-act="closeModal"]'): pg.click('.overlay [data-act="closeModal"] >> nth=-1'); pg.wait_for_timeout(200)
    # set up: give items, blueprints, build clinic + factory, KO Rook into clinic
    pg.evaluate("""() => { const c = window.__game, s = c.state;
      for (const id of ['goldrifle','wolfknux','lmg','smg','nvgoggles','platecarrier','goldwatch','karambit','bomber','silenced','balaclava','molotov','drivegloves','medkitpro','cleaver']) s.stash[id]=(s.stash[id]||0)+1;
      s.blueprints = {smg:1, karambit:1, lmg:1, silenced:1, smoke:1}; s.parts = 40; s.cash = 20000; s.teeth = 500;
      s.base.buildings[0].lv = 3;
      c.save(); }""")
    pg.goto(URL+'?fast=1'); pg.wait_for_selector('#basecv'); pg.wait_for_timeout(800)
    pg.evaluate("""async () => { const c = window.__game, s = c.state;
      const BS = await import('./js/core/base.js'); const P = await import('./js/core/progression.js');
      for (const t of ['clinic','factory']) { const sp = BS.findFreeSpot(s.base, t); const r = BS.startBuild(s, t, sp.x, sp.y, c.now()); if (!r.ok) console.error('build '+t+' '+r.reason); BS.finishTimers(s, c.now() + 1e8); }
      BS.finishTimers(s, c.now() + 1e8);
      const ids = Object.keys(s.heroes.owned); for (const id of ids.slice(0,2)) P.admit(s, id, c.now()-120000);
      c.save(); }""")
    pg.goto(URL+'?fast=1'); pg.wait_for_selector('#basecv'); pg.wait_for_timeout(1200)
    while pg.query_selector('.overlay [data-act="closeModal"]'): pg.click('.overlay [data-act="closeModal"] >> nth=-1'); pg.wait_for_timeout(200)
    for t,name in [('clinic','03-clinic'),('factory','04-factory')]:
        bid = pg.evaluate("(t) => window.__game.state.base.buildings.find(x=>x.t===t).id", t)
        pg.evaluate("(id) => window.__base.centerOn(id)", bid); pg.wait_for_timeout(300)
        pos = pg.evaluate("(id) => window.__base.screenOf(id)", bid)
        pg.mouse.click(pos['x'],pos['y']-10)
        pg.wait_for_timeout(700)
        if not pg.query_selector('.facmodal'): errs.append('no panel on tap '+t)
        if t=='clinic':
            pg.click('.facmodal [data-act="closeModal"]'); pg.wait_for_timeout(300)
            pg.screenshot(path=f'{OUT}/02-clinic-building.png')
            pg.mouse.click(pos['x'],pos['y']-10); pg.wait_for_timeout(600)
        pg.wait_for_selector('.facmodal',timeout=4000)
        if t=='factory':
            pg.click('[data-act="fxPick"][data-id="lmg"]'); pg.wait_for_timeout(300)
        pg.screenshot(path=f'{OUT}/{name}-panel.png')
        if t=='factory':
            pg.click('[data-act="fxCraft"][data-id="lmg"]'); pg.wait_for_timeout(400)
            pg.screenshot(path=f'{OUT}/05-factory-crafting.png')
        pg.click('.facmodal [data-act="closeModal"]'); pg.wait_for_timeout(300)
    # inventory
    pg.evaluate("() => { const C = window.__game; }")
    
    pg.evaluate("""async () => { const Ch = await import('./js/ui/character.js'); Ch.openCharacter(window.__game, 'rook'); }""")
    pg.wait_for_timeout(800)
    pg.screenshot(path=f'{OUT}/01-inventory.png')
    pg.eval_on_selector('.sitem[data-id="goldrifle"]', 'e => { e.scrollIntoView(); e.click(); }'); pg.wait_for_timeout(400)
    pg.screenshot(path=f'{OUT}/06-item-detail-legendary.png')
    pg.eval_on_selector('.sitem[data-id="platecarrier"]', 'e => { e.scrollIntoView(); e.click(); }'); pg.wait_for_timeout(400)
    pg.screenshot(path=f'{OUT}/07-item-compare.png')
    # loot drop on the result screen
    pg.evaluate("""async () => { const T = await import('./js/ui/tactics.js'); const c = window.__game; c.closeModal && c.closeModal(true);
      c.modal(T.resultHtml({win:true, cash:240, item:'goldwatch', bp:'lmg', label:'Op'}, [{hero:'rook', hp:8, kills:2}]), {center:true, backdrop:false, cls:'resultov'}); }""")
    pg.wait_for_timeout(1500)
    pg.screenshot(path=f'{OUT}/08-loot-drop.png')
    b.close()
print('errors', errs[:10])
