# v0.17 showcase: hit-chance breakdown, Overwatch zone + route warning, hop + hit feedback GIF (armour callout,
# status tag), Club Velvet indoors without rain, Safehouse Collect all. VH=390|340 OUT=/workspace/shots-day GIF=1
import os, time, base64, io
from playwright.sync_api import sync_playwright
from PIL import Image
VH = int(os.environ.get('VH', '390')); OUT = os.environ.get('OUT', '/workspace/shots-day'); os.makedirs(OUT, exist_ok=True)
URL = os.environ.get('BASE', 'http://localhost:8765/')
errs = []
def close(pg):
    for _ in range(5):
        if not pg.query_selector('.overlay [data-act="closeModal"]'): break
        pg.click('.overlay [data-act="closeModal"] >> nth=-1'); pg.wait_for_timeout(250)
def wait_player(pg):
    for _ in range(80):
        if pg.evaluate("(()=>{const b=window.__game.state.tactics; const a=b&&b.units.find(x=>x.uid===b.acting); return !!(b&&b.side==='player'&&a&&a.side==='player')})()"): return
        pg.wait_for_timeout(300)
def start_op(pg, op):
    pg.evaluate("document.querySelector('[data-act=\"nav\"][data-tab=\"missions\"]').click()"); pg.wait_for_timeout(400)
    pg.evaluate(f"document.querySelector('[data-act=\"startOp\"][data-id=\"{op}\"]').click()")
    pg.wait_for_selector('.twrap'); pg.wait_for_timeout(2200); close(pg); wait_player(pg)
DEV = "(uid)=>{const b=window.__game.state.tactics; const u=b.units.find(x=>x.uid===uid); const cv=document.getElementById('tacv'); const r=cv.getBoundingClientRect(); return {x:r.x+u.anim.devX*r.width/cv.width, y:r.y+u.anim.devY*r.height/cv.height}}"
def zoom_on(pg, uid, k=1.45, dx=0):
    # centre the camera on a piece (plus dx tiles to the right) and zoom in a little
    pg.evaluate("""(async([uid,k,dx])=>{const Y=await import('./js/ui/yard.js'); const u=window.__game.sub.tactics; const b=window.__game.state.tactics; const p=b.units.find(x=>x.uid===uid);
        const cv=document.getElementById('tacv'); u.cam.z*=k; u.userZ=u.cam.z; u.glide=null; const w=Y.toWorld(p.x+dx,p.y);
        u.cam.x=cv.width*0.42-w.x*u.cam.z; u.cam.y=cv.height*0.36-(w.y-14)*u.cam.z; window.__game.render();})""", [uid, k, dx])
    pg.wait_for_timeout(900)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg = br.new_page(viewport={'width': 844, 'height': VH}, device_scale_factor=2)
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.goto(URL + '?reset=1&fast=1&level=10'); pg.wait_for_selector('#basecv'); pg.wait_for_timeout(700); close(pg)
    pg.evaluate("localStorage.setItem('fangcity.hints', JSON.stringify({move:1,target:1,end:1}))")
    pg.evaluate("(()=>{const s=window.__game.state; s.heroes.squad=['rook','lumen'];})()")
    pg.evaluate("window.__game.fast=false")
    start_op(pg, 'o12')
    # stage: acting piece in the open, target rival 3 tiles off, a second rival on Overwatch
    ids = pg.evaluate("""(async()=>{const T=await import('./js/core/tactics.js'); const b=window.__game.state.tactics; const a=b.units.find(x=>x.uid===b.acting);
      const foes=b.units.filter(x=>x.side==='enemy'&&x.hp>0); const free=(x,y)=>T.walkable(b,x,y,null);
      let spot=null; for (let y=3;y<b.map.h-3&&!spot;y++) for (let x=3;x<b.map.w-5&&!spot;x++) if (free(x,y)&&free(x+1,y)&&free(x+3,y)&&free(x+2,y)&&free(x,y+1)) spot={x,y};
      a.x=spot.x; a.y=spot.y; a.ammo=Math.max(a.ammo||0,4); foes[0].x=spot.x+3; foes[0].y=spot.y;
      if (foes[1]) { foes[1].overwatch=true; foes[1].ammo=Math.max(foes[1].ammo||0,2);
        // park the watcher close enough that its zone crosses Rook's moves (5-6 tiles, line of sight)
        let w=null; for (let y=Math.max(0,spot.y-6); y<=Math.min(b.map.h-1,spot.y+6)&&!w; y++) for (let x=Math.max(0,spot.x-6); x<=Math.min(b.map.w-1,spot.x+8)&&!w; x++) {
          const d=Math.abs(x-spot.x)+Math.abs(y-spot.y); if (d>=5&&d<=6&&free(x,y)&&y<spot.y&&T.hasLOS(b,x,y,spot.x+1,spot.y)) w={x,y}; }
        if (w) { foes[1].x=w.x; foes[1].y=w.y; } }
      window.__game.render(); return {a:a.uid, t:foes[0].uid, o:foes[1]&&foes[1].uid}})()""")
    pg.wait_for_timeout(700)
    zoom_on(pg, ids['a'], 1.35, 1.5)
    pg.evaluate(f"(()=>{{window.__game.sub.tactics.inspect='{ids['t']}'; window.__game.render();}})()"); pg.wait_for_timeout(700)
    pg.screenshot(path=f'{OUT}/v017-hit-breakdown-{VH}.png'); print('shot breakdown')
    # Overwatch zone + a route into it
    tgt = pg.evaluate("""(async()=>{const U=await import('./js/ui/tactics.js'); const T=await import('./js/core/tactics.js'); const b=window.__game.state.tactics; const a=b.units.find(x=>x.uid===b.acting);
        const zs=U.overwatchZones(b); const R=T.reachable(b,a).dist; let best=null, bd=1e9;
        for (const k of R.keys()){ const e=zs.get(k); if(!e||!e.foe.length) continue; const [x,y]=k.split(',').map(Number); if (x===a.x&&y===a.y) continue; const d=R.get(k); if (d<bd) {bd=d; best={x,y};} }
        window.__game.sub.tactics.inspect=null; if(best){window.__game.sub.tactics.preview=best;} window.__game.render(); return best})()""")
    print('route', tgt); pg.wait_for_timeout(800)
    pg.screenshot(path=f'{OUT}/v017-overwatch-zone-{VH}.png'); print('shot ow')
    pg.evaluate("(()=>{window.__game.sub.tactics.preview=null; window.__game.render();})()")
    # GIF: hop two tiles, turn and shoot; the shot lands with hit-stop, star flash, ARMOUR callout and BLEEDING tag
    cdp = pg.context.new_cdp_session(pg); frames = []
    def on(f): frames.append((time.time(), f['data'])); cdp.send('Page.screencastFrameAck', {'sessionId': f['sessionId']})
    cdp.on('Page.screencastFrame', on)
    cdp.send('Page.startScreencast', {'format': 'jpeg', 'quality': 85, 'everyNthFrame': 1})
    t0 = time.time()
    pg.evaluate(f"""(async()=>{{const b=window.__game.state.tactics; const a=b.units.find(x=>x.uid==='{ids['a']}'); const e=b.units.find(x=>x.uid==='{ids['t']}');
        const mv=window.__tfx.move(a.uid, a.x+1, a.y+1) || window.__tfx.move(a.uid, a.x, a.y+1); if (mv) await window.__tfx.play([mv]);
        e.hp=Math.max(e.hp,9); e.armor=2;
        await window.__tfx.play([{{typ:'shot',uid:a.uid,target:e.uid,mode:'shot',chance:72,roll:20,hit:true,dmg:3,blocked:2,bleed:2}}]);
        await new Promise(r=>setTimeout(r,900)); }})()""")
    cdp.send('Page.stopScreencast'); print('frames', len(frames))
    def img(i): return Image.open(io.BytesIO(base64.b64decode(frames[i][1]))).convert('RGB')
    # still: the frame ~0.25s after the hit where the ARMOUR callout and tag are up
    n = len(frames)
    pick = max(0, n - 1 - int(0.9 * n / max(1e-3, frames[-1][0] - frames[0][0])) - 3)
    img(pick).save(f'{OUT}/v017-armour-callout-{VH}.png')
    if os.environ.get('GIF', '1') == '1' and n > 4:
        ims = []; idx = list(range(0, n, max(1, n // 70)))
        for i in idx:
            im = img(i); w, h = im.size; ims.append(im.resize((560, int(h * 560 / w))).quantize(colors=128, method=Image.Quantize.MEDIANCUT))
        durs = [max(30, int((frames[idx[min(j + 1, len(idx) - 1)]][0] - frames[idx[j]][0]) * 1000)) for j in range(len(idx))]
        durs[-1] = 900
        ims[0].save(f'{OUT}/v017-hop-hit-{VH}.gif', save_all=True, append_images=ims[1:], duration=durs, loop=0)
        print('gif', len(ims))
    br.close()
    # Club Velvet: indoor, no rain
    br = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg = br.new_page(viewport={'width': 844, 'height': VH}, device_scale_factor=2)
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL + '?reset=1&fast=1&level=10'); pg.wait_for_selector('#basecv'); pg.wait_for_timeout(700); close(pg)
    pg.evaluate("localStorage.setItem('fangcity.hints', JSON.stringify({move:1,target:1,end:1}))")
    pg.evaluate("(()=>{const s=window.__game.state; s.heroes.squad=['rook','anvil'];})()"); pg.evaluate("window.__game.fast=false")
    start_op(pg, 'o5'); pg.wait_for_timeout(600)
    pg.screenshot(path=f'{OUT}/v017-club-velvet-indoor-{VH}.png'); print('shot velvet')
    # Safehouse collect all
    pg.goto(URL + '?reset=1&fast=1&level=16'); pg.wait_for_selector('#basecv'); pg.wait_for_timeout(700); close(pg)
    pg.evaluate("(()=>{const s=window.__game.state; if(s.stockpile) s.stockpile.at -= 3*3600e3;})()")
    pg.evaluate("document.querySelector('[data-act=\"nav\"][data-tab=\"jobs\"]').click()"); pg.wait_for_timeout(600); close(pg)
    pg.screenshot(path=f'{OUT}/v017-safehouse-collect-all-{VH}.png'); print('shot safehouse')
    br.close()
print('errors', errs); assert not errs
print('SHOWCASE V017 OK', VH)
