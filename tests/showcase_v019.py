# v0.19 showcase: Operators grid with the five new faces, and mid-effect battle frames of their signature
# specials (Cover Breaker hammer, Flashbang, Backstab, Mark), plus Classic unit style. OUT dir, VH=390.
import os
from playwright.sync_api import sync_playwright
VH = int(os.environ.get('VH', '390')); URL = os.environ.get('BASE', 'http://localhost:8765/')
OUT = os.environ.get('OUT', '/workspace/shots-day'); os.makedirs(OUT, exist_ok=True)
def close(pg):
    for _ in range(5):
        if not pg.query_selector('.overlay [data-act="closeModal"]'): break
        pg.click('.overlay [data-act="closeModal"] >> nth=-1'); pg.wait_for_timeout(250)
SETUP = """async ([hero, act, tgt]) => {
  const T = await import('./js/core/tactics.js');
  const b = window.__game.state.tactics; const u = b.units.find(x=>x.hero===hero&&x.side==='player');
  const f = b.units.filter(x=>x.side==='enemy'&&x.hp>0)[0]; const pal = b.units.find(x=>x.side==='player'&&x!==u);
  f.hp = Math.max(f.hp, 30); f.maxHp = Math.max(f.maxHp, 30); f.hidden = 0;
  b.acting = u.uid; b.side = 'player'; u.ap = u.maxAp + 1; u.cd = {}; u.alv = 6; u.jammed = 0;
  const a = { type: act, uid: u.uid };
  if (tgt === 'foe') { a.target = f.uid; a.mode = act; }
  if (tgt === 'tile') { a.x = f.x; a.y = f.y; }
  for (let i = 0; i < 10; i++) { const r = T.apply(b, {...a}); if (r.ok && (act !== 'smash' && act !== 'backstab' || r.events.some(e=>e.hit))) { window.__evs = r.events; return true; } u.ap = u.maxAp + 1; u.cd = {}; }
  return false;
}"""
with sync_playwright() as p:
    br = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg = br.new_page(viewport={'width': 844, 'height': VH}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg.goto(URL + '?reset=1&fast=1&level=12'); pg.wait_for_selector('#basecv'); pg.wait_for_timeout(600); close(pg)
    pg.evaluate("""(async()=>{const H=await import('./js/core/heroes.js'); const I=await import('./js/core/items.js'); const s=window.__game.state;
      for (const id of ['vigil','jinx','sable','reed']) H.grantHero(s,id); I.ensureItems(s); s.heroes.squad=['sledge','jinx','sable','reed']; s.energy={n:10,at:Date.now()}; s.heroes.tutorialDone=true; window.__game.save();})()""")
    pg.goto(URL); pg.wait_for_selector('#play'); pg.click('#play'); pg.wait_for_selector('#basecv'); pg.wait_for_timeout(600); close(pg)
    pg.click('#nav [data-act="nav"][data-tab="crew"]'); pg.wait_for_timeout(300); pg.click('[data-act="nav"][data-tab="heroes"] >> nth=0'); pg.wait_for_timeout(500)
    pg.evaluate("document.querySelector('.optile[data-id=sledge]').scrollIntoView({block:'center'})"); pg.wait_for_timeout(500)
    pg.screenshot(path=f'{OUT}/v019-operators-grid.png'); print('grid')
    pg.click('.optile[data-id="sledge"]'); pg.wait_for_timeout(600)
    pg.screenshot(path=f'{OUT}/v019-sledge-sheet.png'); print('sheet')
    pg.click('[data-act="charBack"]'); pg.wait_for_timeout(300)
    pg.click('#nav [data-act="nav"][data-tab="missions"]'); pg.wait_for_timeout(400)
    pg.eval_on_selector('[data-act="startOp"][data-id="o14"]', 'e=>e.click()')
    pg.wait_for_selector('.twrap', timeout=10000); pg.wait_for_timeout(1500); close(pg)
    pg.evaluate("document.querySelectorAll('.coachtip,.tcoach').forEach(e=>e.remove())")
    for _ in range(2): pg.click('button[aria-label="Zoom in"]'); pg.wait_for_timeout(250)
    for n, hero, act, tgt, ms in [('sledge-cover-breaker', 'sledge', 'smash', 'foe', 330), ('jinx-flashbang', 'jinx', 'flash', 'tile', 620),
                                  ('sable-backstab', 'sable', 'backstab', 'foe', 300), ('reed-payoff', 'reed', 'bribe', 'foe', 260)]:
        # walk the foe right up to the hero first so melee kits connect
        pg.evaluate("""([hero, adj]) => { const b = window.__game.state.tactics; const u = b.units.find(x=>x.hero===hero&&x.side==='player'); const f = b.units.filter(x=>x.side==='enemy'&&x.hp>0)[0];
          const T = window.__game; const cands = adj ? [[1,0],[0,1],[-1,0],[0,-1]] : [[0,-3],[3,0],[-3,0],[0,3],[2,-2]];
          for (const [dx,dy] of cands) { const x=u.x+dx, y=u.y+dy; if (!b.units.some(o=>o.hp>0&&o.x===x&&o.y===y) && b.map.tiles && b.map.tiles[y] && b.map.tiles[y][x] && !['wall','water','block'].includes(b.map.tiles[y][x].t||b.map.tiles[y][x])) { f.x=x; f.y=y; break; } } }""", [hero, act in ('smash', 'backstab')])
        ok = pg.evaluate(SETUP, [hero, act, tgt])
        if not ok: print('skip', n); continue
        pg.evaluate("(()=>{window.__tfx.play(window.__evs); return 1})()")
        os.makedirs('/tmp/v019burst', exist_ok=True)
        for k in range(16):
            pg.wait_for_timeout(60); pg.screenshot(path=f'/tmp/v019burst/{n}-{k:02d}.png')
        pg.wait_for_timeout(2200)
    pg.evaluate("window.__actors.setUnitStyle('classic')"); pg.wait_for_timeout(1200)
    pg.screenshot(path=f'{OUT}/v019-classic-style.png'); print('classic')
    pg.evaluate("window.__actors.setUnitStyle('fig')")
    br.close()
