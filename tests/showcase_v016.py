# v0.16 showcase shots: figurine line-up on the board, close zoom on a rainy night map, and the base
# with the new Clinic building. Not a pass/fail test; writes to OUT (default /workspace/shots-day).
import os
from playwright.sync_api import sync_playwright
OUT = os.environ.get('OUT', '/workspace/shots-day'); os.makedirs(OUT, exist_ok=True)
VH = int(os.environ.get('VH', '390'))
URL = os.environ.get('BASE', 'http://localhost:8765/')
errs = []
def close(pg):
    for _ in range(5):
        if not pg.query_selector('.overlay [data-act="closeModal"]'): break
        pg.click('.overlay [data-act="closeModal"] >> nth=-1'); pg.wait_for_timeout(250)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg = b.new_page(viewport={'width': 844, 'height': VH}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.goto(URL + '?reset=1&fast=1&level=12'); pg.wait_for_selector('#basecv'); pg.wait_for_timeout(700); close(pg)
    # base with a Clinic built next to the den, plus a few neighbours for scale
    pg.evaluate("""(()=>{const s=window.__game.state; const B=s.base.buildings;
      const add=(id,t,x,y)=>{ if(!B.some(q=>q.id===id)) B.push({id,t,x,y,lv:1,till:0,job:null,lt:false}); };
      add('sc1','clinic',21,18); add('sc2','stall',15,18); add('sc3','gym',18,21); add('sc4','factory',21,21);
      window.__game.save && window.__game.save(); window.__game.go('base');})()""")
    pg.wait_for_timeout(900); close(pg)
    pg.screenshot(path=f'{OUT}/v016-base-clinic-{VH}.png'); print('shot base')
    # zoom the base view in on the clinic (pinch-free: wheel)
    cv = pg.query_selector('#basecv').bounding_box()
    pg.mouse.move(cv['x'] + cv['width'] * 0.55, cv['y'] + cv['height'] * 0.5)
    for _ in range(4): pg.mouse.wheel(0, -240); pg.wait_for_timeout(120)
    pg.wait_for_timeout(600); pg.screenshot(path=f'{OUT}/v016-base-clinic-zoom-{VH}.png')
    # rainy night op with a line-up of every figurine on the board
    pg.evaluate("(()=>{const s=window.__game.state; s.heroes.squad=['rook','anvil','vesper'].filter(h=>s.heroes.owned[h]);})()")
    pg.evaluate("window.__game.go('missions')"); pg.wait_for_timeout(400); close(pg)
    pg.evaluate("document.querySelector('[data-act=\"startOp\"][data-id=\"o12\"]').click()")
    pg.evaluate("localStorage.setItem('fangcity.hints', JSON.stringify({move:1,target:1,end:1}))")
    pg.wait_for_selector('.twrap', timeout=10000); pg.wait_for_timeout(1500); close(pg)
    pg.evaluate("""(()=>{const b=window.__game.state.tactics; const ids=Object.keys(window.__actors.FIGS);
      const base=b.units[0]; const have=new Set(b.units.map(u=>u.hero)); let i=0;
      const free=(x,y)=>x>=0&&y>=0&&x<b.map.w&&y<b.map.h&&!b.map.tiles[y][x].decor&&!['water','wall'].includes(b.map.tiles[y][x].t)&&!b.units.some(u=>u.x===x&&u.y===y);
      // two rows: crew on one, rivals on the next, packed left to right from the first player piece
      const crewIds=ids.filter(h=>!['hook','knack','slab','rill','pact','bruno','ash','mica'].includes(h));
      const rivalIds=ids.filter(h=>!crewIds.includes(h));
      b.units.forEach(u=>{u.x=-50-u.x; u.y=-50;}); // park the real pieces while we lay out
      const row=(list,y,side,x0)=>{ let x=x0; for (const h of list){ while(x<b.map.w&&!free(x,y)) x++; if(x>=b.map.w) break;
        let u=b.units.find(q=>q.hero===h&&q.x<-40); if(!u){ u=JSON.parse(JSON.stringify({...base, anim:null})); delete u.anim; u.uid='show'+(i++); u.hero=h; b.units.push(u);} 
        u.side=side; u.x=x; u.y=y; u.hp=u.maxHp; x++; } };
      let best=null; for(let y=1;y<b.map.h-1&&!best;y++) for(let x0=0;x0<b.map.w-9&&!best;x0++){ let ok=true; for(let k=0;k<9;k++) if(!free(x0+k,y)||!free(x0+k,y+1)) ok=false; if(ok) best={x0,y}; }
      if(!best) best={x0:1,y:base.y};
      row(crewIds,best.y,'player',best.x0); row(rivalIds,best.y+1,'enemy',best.x0);
      b.units=b.units.filter(u=>u.x>=0);
      window.__game.render(); return b.units.length})()""")
    pg.wait_for_timeout(1200)
    pg.screenshot(path=f'{OUT}/v016-figurine-lineup-{VH}.png'); print('shot lineup')
    pg.click('[data-act="tzoom"][data-z="fit"]'); pg.wait_for_timeout(900)
    pg.screenshot(path=f'{OUT}/v016-figurine-lineup-fit-{VH}.png')
    # zoom in on the middle of the line-up with the wheel
    d = pg.evaluate("(()=>{const b=window.__game.state.tactics; const us=b.units.filter(u=>u.anim&&u.anim.devX!=null); const cv=document.getElementById('tacv'); const r=cv.getBoundingClientRect(); const u=us.find(q=>q.hero==='lumen')||us[0]; return {x:r.x+u.anim.devX*r.width/cv.width, y:r.y+u.anim.devY*r.height/cv.height}})()")
    pg.mouse.move(d['x'], d['y'] - 10)
    for _ in range(7): pg.mouse.wheel(0, -200); pg.wait_for_timeout(90)
    pg.wait_for_timeout(1300)
    pg.screenshot(path=f'{OUT}/v016-battle-zoom-rain-{VH}.png'); print('shot zoom')
    b.close()
print('errors', errs)
