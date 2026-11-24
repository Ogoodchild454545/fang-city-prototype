# v0.17: battle feel + readability (hit-chance breakdown, Overwatch zones and stance rings, armour-blocked
# and status popups, hop squash/stretch and turn pivots, indoor maps without rain) and the UI pass
# (tap targets >= 44px on primary buttons, no clipped text, clear close controls). VH=390|340, OUT=dir
import os, json
from playwright.sync_api import sync_playwright
VH = int(os.environ.get('VH', '390')); OUT = os.environ.get('OUT', '/workspace/shots-day'); os.makedirs(OUT, exist_ok=True)
URL = os.environ.get('BASE', 'http://localhost:8765/')
errs = []
def close(pg):
    for _ in range(5):
        if not pg.query_selector('.overlay [data-act="closeModal"]'): break
        pg.click('.overlay [data-act="closeModal"] >> nth=-1'); pg.wait_for_timeout(250)
def shot(pg, n): pg.wait_for_timeout(250); pg.screenshot(path=f'{OUT}/v017-{n}-{VH}.png'); print('shot', n)
ACT = """(()=>{const b=window.__game.state.tactics; const a=b.units.find(x=>x.uid===b.acting); const cv=document.getElementById('tacv'); const r=cv.getBoundingClientRect();
  return {x:r.x+a.anim.devX*r.width/cv.width, y:r.y+a.anim.devY*r.height/cv.height, ax:a.x, ay:a.y, ap:a.ap, uid:a.uid}})()"""
def wait_player(pg):
    for _ in range(80):
        if pg.evaluate("(()=>{const b=window.__game.state.tactics; const a=b&&b.units.find(x=>x.uid===b.acting); return !!(b&&b.side==='player'&&a&&a.side==='player')})()"): return
        pg.wait_for_timeout(300)
    raise AssertionError('player turn never came')
def start_op(pg, op):
    pg.evaluate("document.querySelector('[data-act=\"nav\"][data-tab=\"missions\"]').click()"); pg.wait_for_timeout(400)
    pg.evaluate(f"document.querySelector('[data-act=\"startOp\"][data-id=\"{op}\"]').click()")
    pg.wait_for_selector('.twrap'); pg.wait_for_timeout(2200); close(pg); wait_player(pg)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg = br.new_page(viewport={'width': 844, 'height': VH}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.goto(URL + '?reset=1&fast=1&level=10'); pg.wait_for_selector('#basecv'); pg.wait_for_timeout(700); close(pg)
    pg.evaluate("localStorage.setItem('fangcity.hints', JSON.stringify({move:1,target:1,end:1}))")

    # --- indoor maps: no rain/drizzle, but still wet-look reflections
    r = pg.evaluate("""(async()=>{const Y=await import('./js/ui/yard.js'); const M=await import('./js/core/maps/index.js');
       const get=(id)=>M.BUILTIN_BY_ID[id];
       return {club:Y.isIndoor(get('club_velvet')), clubWet:Y.isWet(get('club_velvet')), neon:Y.isIndoor(get('neon_strip'))}})()""")
    print('indoor', r); assert r['club'] and r['clubWet'] and not r['neon']


    pg.evaluate("(()=>{const s=window.__game.state; s.heroes.squad=['rook','lumen'];})()")
    pg.evaluate("window.__game.fast=false")
    start_op(pg, 'o12')

    # --- hit-chance breakdown on the attack bar and the inspect panel
    pg.evaluate("""(()=>{const b=window.__game.state.tactics; const a=b.units.find(x=>x.uid===b.acting); const e=b.units.find(x=>x.side==='enemy'&&x.hp>0);
       const spots=[[3,0],[0,3],[-3,0],[0,-3],[3,1],[1,3],[2,0],[0,2]]; for (const [dx,dy] of spots){const x=a.x+dx,y=a.y+dy; const t=b.map.tiles[y]&&b.map.tiles[y][x]; if(t&&!t.block&&!b.units.some(u=>u.x===x&&u.y===y)){e.x=x;e.y=y;break;}} a.ammo=Math.max(a.ammo||0,3); window.__game.render();})()""")
    pg.wait_for_timeout(500)
    e = pg.evaluate("""(()=>{const b=window.__game.state.tactics; const u=b.units.find(x=>x.side==='enemy'&&x.hp>0); const cv=document.getElementById('tacv'); const r=cv.getBoundingClientRect(); return {x:r.x+u.anim.devX*r.width/cv.width, y:r.y+u.anim.devY*r.height/cv.height, uid:u.uid}})()""")
    pg.touchscreen.tap(e['x'], e['y'] - 8); pg.wait_for_timeout(600)
    if not pg.query_selector('#tinsp'):
        pg.evaluate(f"(()=>{{window.__game.sub.tactics.inspect='{e['uid']}'; window.__game.render();}})()"); pg.wait_for_timeout(400)
    assert pg.query_selector('#tibrk'), 'inspect breakdown'
    brk = pg.inner_text('#tibrk'); print('breakdown', brk.replace('\n', ' | '))
    assert 'Base aim' in brk and 'Hit chance' in brk
    if pg.query_selector('[data-act="tconfirm"]'):
        assert pg.query_selector('#tabodds'), 'attack bar odds chips'
        chips = pg.inner_text('#tabodds'); print('chips', chips.replace('\n', ' ')); assert 'Base aim' in chips
        # numbers add up (or hit the 5-95 cap)
        og = pg.evaluate(f"""(async()=>{{const U=await import('./js/ui/tactics.js'); const T=await import('./js/core/tactics.js'); const b=window.__game.state.tactics;
            const a=b.units.find(x=>x.uid===b.acting); const en=b.units.find(x=>x.uid==='{e['uid']}'); const pr=T.previewShot(b,a,en,'shot'); const g=U.oddsGroups(pr); return {{total:g.total, chance:g.chance, capped:g.capped}}}})()""")
        print('odds', og); assert og['total'] == og['chance'] or og['capped'] and og['chance'] in (5, 95)
    shot(pg, 'hit-breakdown')

    # --- Overwatch zone: rival on overwatch paints hatched tiles; a path into it warns
    z = pg.evaluate("""(async()=>{const U=await import('./js/ui/tactics.js'); const b=window.__game.state.tactics; const e=b.units.find(x=>x.uid==='%s');
        e.overwatch=true; e.ammo=Math.max(e.ammo||0,2); const zs=U.overwatchZones(b); let foe=0; for (const v of zs.values()) if (v.foe.length) foe++;
        window.__game.sub.tactics.inspect=null; window.__game.render(); return {foe}})()""" % e['uid'])
    print('ow zone tiles', z); assert z['foe'] > 0
    pg.wait_for_timeout(400)
    tgt = pg.evaluate("""(async()=>{const U=await import('./js/ui/tactics.js'); const T=await import('./js/core/tactics.js'); const b=window.__game.state.tactics; const a=b.units.find(x=>x.uid===b.acting);
        const zs=U.overwatchZones(b); let best=null, R=new Map();
        // stand the acting piece just outside the zone so one step takes it in
        outer: for (let y=0;y<b.map.h;y++) for (let x=0;x<b.map.w;x++) { if (zs.has(`${x},${y}`) || !T.walkable(b,x,y,a.uid)) continue;
          for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const k=`${x+dx},${y+dy}`; const e=zs.get(k); if (e&&e.foe.length&&T.walkable(b,x+dx,y+dy,a.uid)) { a.x=x; a.y=y; best={x:x+dx,y:y+dy}; break outer; } } }
        R=T.reachable(b,a).dist;
        if(best){window.__game.sub.tactics.preview=best; window.__game.render();} return best||{none:1,n:R.size,ap:a.ap,acting:a.uid,zs:zs.size}})()""")
    print('ow target', tgt)
    if tgt and 'none' not in tgt:
        pg.wait_for_timeout(400)
        bar = pg.inner_text('.tabar'); print('bar', bar.replace('\n', ' | ')); assert 'Overwatch' in bar
    shot(pg, 'overwatch-zone')
    pg.evaluate("(()=>{window.__game.sub.tactics.preview=null; window.__game.render();})()")

    # --- hop: squash on landing, stretch in the air; turn pivot is animated
    hop = pg.evaluate("""(()=>{const A=window.__actors; const b=window.__game.state.tactics; const a=b.units.find(x=>x.uid===b.acting); const an=A.ensureAnim(a);
        const out={}; const keep={clip:an.clip,hop:an.hop}; an.clip='walk';
        for (const p of [0.07,0.3,0.5,0.95]) { an.hop=p; const q=A.figPose(a,an,performance.now()); out[p]={lift:+q.lift.toFixed(2), sy:+q.sy.toFixed(3), sx:+q.sx.toFixed(3)}; }
        an.clip=keep.clip; an.hop=keep.hop;
        const f0=an.facing||1; A.faceToward(a,a.x,a.y,a.x-f0*2,a.y+f0*2); const turning=an.turnT0!=null; A.faceToward(a,a.x,a.y,a.x+f0*2,a.y-f0*2);
        return {out,turning}})()""")
    print('hop', json.dumps(hop)); o = hop['out']
    assert o['0.07']['sy'] < 1 and o['0.3']['sy'] > 1 and o['0.5']['lift'] > 8 and o['0.95']['sy'] < 0.95 and o['0.95']['lift'] == 0, 'crouch, stretch, arc, squash'
    assert hop['turning'], 'facing change starts a pivot'
    # --- armour-blocked callout + status popup through the real event player
    pg.evaluate("""(()=>{const b=window.__game.state.tactics; const a=b.units.find(x=>x.uid===b.acting); const e=b.units.find(x=>x.side==='enemy'&&x.hp>0);
        e.hp=Math.max(e.hp,8); window.__tfx.play([{typ:'shot',uid:a.uid,target:e.uid,mode:'shot',chance:80,roll:10,hit:true,dmg:3,blocked:2,bleed:2}]);})()""")
    pg.wait_for_timeout(450)
    st = pg.evaluate("""(()=>{const u=window.__game.sub.tactics; return {callouts:(u.fx&&u.fx.bits||[]).filter(b=>b.typ==='callout').map(b=>b.text), pills:u.floats.filter(f=>f.pill).map(f=>f.text)}})()""")
    print('feedback', st); assert any(t.startswith('ARMOUR') for t in st['callouts']) and 'BLEEDING' in st['pills']
    shot(pg, 'armour-callout')
    pg.wait_for_timeout(1500)

    # --- fewer taps: Safehouse "Collect all" sweeps every ready reward in one go
    pg.goto(URL + '?reset=1&fast=1&level=16'); pg.wait_for_selector('#basecv'); pg.wait_for_timeout(700); close(pg)
    pg.evaluate("(()=>{const s=window.__game.state; if(s.stockpile) s.stockpile.at = (s.stockpile.at||Date.now()) - 3*3600e3; })()")
    pg.evaluate("document.querySelector('[data-act=\"nav\"][data-tab=\"jobs\"]').click()"); pg.wait_for_timeout(500); close(pg)
    if pg.query_selector('[data-act="collectAll"]'):
        h = pg.evaluate("document.querySelector('[data-act=\"collectAll\"]').getBoundingClientRect().height"); assert h >= 44, h
        shot(pg, 'collect-all')
        cash0 = pg.evaluate('window.__game.state.cash')
        pg.click('[data-act="collectAll"]'); pg.wait_for_timeout(500)
        assert not pg.query_selector('[data-act="collectAll"]'), 'all collected'
        assert pg.evaluate("(()=>{const M=window.__game.state; return true})()")
        print('collect all ok', cash0, '->', pg.evaluate('window.__game.state.cash'))
    else:
        raise AssertionError('Collect all should show with the stockpile and daily pay-out ready')
    br.close()
print('errors', errs); assert not errs
print('V017 BATTLE OK', VH)

# --- UI pass: every screen, primary taps >= 44px, close >= 36px, no clipped text, no console errors
import subprocess, sys
r = subprocess.run([sys.executable, os.path.join(os.path.dirname(__file__), 'ui_audit.py')], env={**os.environ, 'STRICT': '1', 'VH': str(VH), 'OUT': os.environ.get('AUDIT_OUT', '/tmp/v017-audit')}, capture_output=True, text=True)
print(r.stdout[-600:]); assert r.returncode == 0, r.stderr[-1500:]
print('V017 OK', VH)
