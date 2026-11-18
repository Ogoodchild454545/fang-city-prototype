# v0.14: Operators grid (owned/greyed/future), greyed dossier, Complete/Replay ops, XCOM-style inspect
# panel with statuses, board status chips, zoom, gunshot / claw / horn-impact effects and tile-by-tile
# movement. Frames are captured with a CDP screencast. VH=390 or 340, SHOTS=dir, GIF=1 builds a gif.
import os, base64, time, json
from playwright.sync_api import sync_playwright
OUT = os.environ.get('SHOTS', '/workspace/shots-v014'); os.makedirs(OUT, exist_ok=True)
VH = int(os.environ.get('VH', '390'))
URL = os.environ.get('BASE', 'http://localhost:8765/')
errs = []
def shot(pg, n, **kw): pg.wait_for_timeout(250); pg.screenshot(path=f'{OUT}/{n}-{VH}.png', **kw); print('shot', n)
def close(pg):
    for _ in range(5):
        if not pg.query_selector('.overlay [data-act="closeModal"]'): break
        pg.click('.overlay [data-act="closeModal"] >> nth=-1'); pg.wait_for_timeout(250)
DEV = "(uid)=>{const b=window.__game.state.tactics; const u=b.units.find(x=>x.uid===uid); const cv=document.getElementById('tacv'); const r=cv.getBoundingClientRect(); return {x:r.x+u.anim.devX*r.width/cv.width, y:r.y+u.anim.devY*r.height/cv.height}}"

class Cast:
    """CDP screencast: collects every painted frame with a wall-clock time."""
    def __init__(self, pg):
        self.cdp = pg.context.new_cdp_session(pg); self.frames = []
        self.cdp.on('Page.screencastFrame', self._on)
    def _on(self, f):
        self.frames.append((time.time(), f['data'])); self.cdp.send('Page.screencastFrameAck', {'sessionId': f['sessionId']})
    def start(self): self.frames = []; self.cdp.send('Page.startScreencast', {'format': 'png', 'everyNthFrame': 1})
    def stop(self): self.cdp.send('Page.stopScreencast')
    def save(self, i, path):
        open(path, 'wb').write(base64.b64decode(self.frames[i][1]))

with sync_playwright() as p:
    br = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg = br.new_page(viewport={'width': 844, 'height': VH}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.goto(URL + '?reset=1&fast=1&level=10'); pg.wait_for_selector('#basecv'); pg.wait_for_timeout(700); close(pg)
    # --- save migrated, no sidearm slot anywhere
    st = pg.evaluate("(()=>{const s=window.__game.state; return {v:s.v||s.version, eq:Object.values(s.heroes.owned||{}).map(h=>Object.keys(h.equip||{}))}})()")
    assert all('sidearm' not in e for e in st['eq']), st
    # --- Operators: every operator, owned in colour, rest greyed, future (season 1) tagged
    pg.click('#nav [data-act="nav"][data-tab="crew"]'); pg.wait_for_timeout(400); close(pg)
    shot(pg, '00-my-crew')
    pg.evaluate("document.querySelector('[data-act=\"nav\"][data-tab=\"heroes\"]').click()"); pg.wait_for_timeout(500); close(pg)
    tiles = pg.evaluate("[...document.querySelectorAll('.optile')].map(t=>({own:!t.classList.contains('locked') && !t.classList.contains('grey'), cls:t.className, act:t.dataset.act, id:t.dataset.id}))")
    print('tiles', len(tiles), [t['act'] for t in tiles])
    assert len(tiles) >= 10, 'all operators incl. future'
    assert any(t['act'] == 'heroInfo' for t in tiles) and any(t['act'] == 'openHero' for t in tiles)
    assert any(t['id'] == 'stitch' for t in tiles)
    shot(pg, '01-operators-grid')
    pg.click('.optile[data-id="stitch"]'); pg.wait_for_timeout(500)
    assert pg.query_selector('.opinfo'), 'dossier opens'
    assert not pg.query_selector('.opinfo [data-act="equip"], .opinfo [data-act="openSlot"]'), 'no equip in greyed dossier'
    shot(pg, '02-greyed-operator-stitch')
    close(pg)
    locked = [t['id'] for t in tiles if t['act'] == 'heroInfo' and t['id'] != 'stitch']
    if locked:
        pg.click(f'.optile[data-id="{locked[0]}"]'); pg.wait_for_timeout(500); shot(pg, '03-greyed-operator-' + locked[0]); close(pg)
    # --- Ops: a cleared op shows Complete and a half-reward Replay
    pg.evaluate("(()=>{const s=window.__game.state; s.ops=s.ops||{}; s.ops.cleared=s.ops.cleared||{}; s.ops.cleared.o5=1; s.ops.cleared.o1=1; s.heroes.squad=['rook','anvil'];})()")
    pg.click('#nav [data-act="nav"][data-tab="missions"]'); pg.wait_for_timeout(500); close(pg)
    card = pg.evaluate("(()=>{const b=document.querySelector('[data-act=\"startOp\"][data-id=\"o5\"]'); const c=b.closest('.opscard'); c.scrollIntoView({block:'center'}); return c.innerText})()")
    print('card', card.replace('\n', ' | ')); assert 'Complete' in card and 'REPLAY' in card.upper() and '½' in card
    pg.wait_for_timeout(300)
    shot(pg, '04-op-complete-replay')
    # --- Battle (real timing, not fast)
    pg.evaluate("window.__game.fast=false")
    pg.evaluate("document.querySelector('[data-act=\"startOp\"][data-id=\"o5\"]').click()")
    pg.wait_for_selector('.twrap', timeout=10000); pg.wait_for_timeout(2200); close(pg)
    units = pg.evaluate("window.__game.state.tactics.units.map(u=>({uid:u.uid,hero:u.hero,side:u.side,x:u.x,y:u.y}))")
    print(units)
    rook = next(u for u in units if u['hero'] == 'rook'); anvil = next(u for u in units if u['hero'] == 'anvil')
    foes = [u for u in units if u['side'] == 'enemy']
    # wait for the player's turn
    for _ in range(60):
        if pg.evaluate("(()=>{const b=window.__game.state.tactics; const a=b.units.find(x=>x.uid===b.acting); return b.side==='player' && a && a.side==='player'})()"): break
        pg.wait_for_timeout(300)
    # debuffs on a foe, a buff on our side, then tap the foe
    pg.evaluate("""([f,r])=>{const b=window.__game.state.tactics; const e=b.units.find(x=>x.uid===f); e.bleed=3; e.shaken=1; e.suppressed=1;
       const o=b.units.find(x=>x.uid===r); o.rallied=1; window.__game.render();}""", [foes[0]['uid'], rook['uid']])
    pg.wait_for_timeout(500)
    d = pg.evaluate(DEV, foes[0]['uid'])
    pg.mouse.click(d['x'], d['y'] - 8); pg.wait_for_timeout(500)
    assert pg.query_selector('#tinsp'), 'inspect panel opens on tap'
    names = pg.evaluate("[...document.querySelectorAll('#tinsp .tist b')].map(b=>b.firstChild.textContent)")
    print('statuses', names); assert 'Bleeding' in names and 'Shaken' in names
    assert pg.evaluate("window.__game.state.tactics.units.find(x=>x.uid===%s).hp" % json.dumps(foes[0]['uid'])) > 0
    shot(pg, '05-status-panel-debuffed')
    pg.click('[data-act="closeInspect"]'); pg.wait_for_timeout(200)
    # tap an ally: panel, never an action
    d = pg.evaluate(DEV, anvil['uid']); pg.mouse.click(d['x'], d['y'] - 8); pg.wait_for_timeout(400)
    assert pg.query_selector('#tinsp') and not pg.query_selector('#tinsp .tiact')
    shot(pg, '06-status-panel-ally')
    pg.click('[data-act="closeInspect"]'); pg.wait_for_timeout(200)
    # --- zoom
    z0 = pg.evaluate("window.__game.state && (()=>{return 1})()")
    for _ in range(3): pg.click('[data-act="tzoom"][data-z="in"]'); pg.wait_for_timeout(120)
    pg.wait_for_timeout(400)
    shot(pg, '07-zoomed-in')
    for _ in range(2): pg.click('[data-act="tzoom"][data-z="out"]'); pg.wait_for_timeout(100)
    pg.click('[data-act="tzoom"][data-z="fit"]'); pg.wait_for_timeout(900)
    # --- scripted effects with real timings, captured frame by frame
    cast = Cast(pg)
    f0 = foes[0]
    # place Rook two tiles from the foe, walk him one tile... first a longer walk away and back
    path_info = pg.evaluate("""([r,f])=>{const b=window.__game.state.tactics; const R=b.units.find(x=>x.uid===r); const F=b.units.find(x=>x.uid===f);
        const T=window.__tcore; return {rx:R.x, ry:R.y, fx:F.x, fy:F.y, w:b.map.w, h:b.map.h}}""", [rook['uid'], f0['uid']])
    print('pos', path_info)
    cast.start(); t0 = time.time()
    # 1) movement: real move action through the game (path from the core), then a shot, then a claw pounce
    moved = pg.evaluate("""async ([r])=>{const b=window.__game.state.tactics; const R=b.units.find(x=>x.uid===r);
        // pick a reachable tile 3+ steps away
        const H=window.__thelp; const cand=[]; for(let y=0;y<b.map.h;y++)for(let x=0;x<b.map.w;x++){const d=Math.abs(x-R.x)+Math.abs(y-R.y); if(d>=3&&d<=4) cand.push({x,y});}
        const F=b.units.find(u=>u.side==='enemy'); cand.sort((p,q)=>(Math.abs(p.x-F.x)+Math.abs(p.y-F.y))-(Math.abs(q.x-F.x)+Math.abs(q.y-F.y)));
        return {from:{x:R.x,y:R.y}, cand: cand.slice(0,40)}}""", [rook['uid']])
    ok = False
    for c in moved['cand']:
        res = pg.evaluate("""async ([r,c])=>{const b=window.__game.state.tactics; const R=b.units.find(x=>x.uid===r); const x0=R.x,y0=R.y; 
            const ev=window.__tfx.move(r,c.x,c.y); if(!ev) return null; await window.__tfx.play([ev]); return {x0,y0,x:R.x,y:R.y,n:ev.path.length}}""", [rook['uid'], c])
        if res: ok = res; break
    print('move', ok)
    t_move = time.time()
    pg.wait_for_timeout(200)
    t_shot0 = time.time()
    # 2) gunshot from Rook (hit), then a miss
    pg.evaluate("""async ([r,f])=>{await window.__tfx.play([{typ:'shot', uid:r, target:f, mode:'shot', hit:true, dmg:3, roll:12}]);}""", [rook['uid'], f0['uid']])
    t_shot = time.time()
    pg.wait_for_timeout(250)
    t_miss0 = time.time()
    pg.evaluate("""async ([r,f])=>{await window.__tfx.play([{typ:'shot', uid:r, target:f, mode:'shot', hit:false, roll:93}]);}""", [rook['uid'], f0['uid']])
    pg.wait_for_timeout(300)
    # 3) Rook's claw special: put him next to the foe and pounce/maul
    pg.evaluate("""([r,f])=>{const b=window.__game.state.tactics; const R=b.units.find(x=>x.uid===r); const F=b.units.find(x=>x.uid===f);
        const opts=[[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy])=>({x:F.x+dx,y:F.y+dy})).filter(p=>p.x>=0&&p.y>=0&&p.x<b.map.w&&p.y<b.map.h&&!b.units.some(u=>u.hp>0&&u.x===p.x&&u.y===p.y));
        const p=opts[0]; R.x=p.x; R.y=p.y; if(R.anim){R.anim.x=null;} }""", [rook['uid'], f0['uid']])
    pg.wait_for_timeout(350)
    t_claw0 = time.time()
    pg.evaluate("""async ([r,f])=>{await window.__tfx.play([{typ:'shot', uid:r, target:f, mode:'maul', hit:true, dmg:5}]);}""", [rook['uid'], f0['uid']])
    pg.wait_for_timeout(300)
    # 4) Anvil's horn slam: next to the other foe
    f1 = foes[1] if len(foes) > 1 else f0
    pg.evaluate("""([r,f])=>{const b=window.__game.state.tactics; const R=b.units.find(x=>x.uid===r); const F=b.units.find(x=>x.uid===f);
        const opts=[[-1,0],[1,0],[0,1],[0,-1]].map(([dx,dy])=>({x:F.x+dx,y:F.y+dy})).filter(p=>p.x>=0&&p.y>=0&&p.x<b.map.w&&p.y<b.map.h&&!b.units.some(u=>u.hp>0&&u.x===p.x&&u.y===p.y));
        const p=opts[0]; R.x=p.x; R.y=p.y; }""", [anvil['uid'], f1['uid']])
    pg.wait_for_timeout(350)
    t_imp0 = time.time()
    pg.evaluate("""async ([r,f])=>{await window.__tfx.play([{typ:'shot', uid:r, target:f, mode:'maul', hit:true, dmg:6}]);}""", [anvil['uid'], f1['uid']])
    pg.wait_for_timeout(500)
    cast.stop()
    fr = cast.frames
    print('frames', len(fr))
    def nearest(t):
        return min(range(len(fr)), key=lambda i: abs(fr[i][0] - t))
    os.makedirs('/tmp/v014f', exist_ok=True)
    for i, (t, dta) in enumerate(fr): open(f'/tmp/v014f/{VH}-{i:04d}.png', 'wb').write(base64.b64decode(dta))
    json.dump([[t - t0] for t, _ in fr], open(f'/tmp/v014f/{VH}-times.json', 'w'))
    print('t_move', t_move - t0, 't_shot', t_shot - t0, 'claw', t_claw0 - t0, 'imp', t_imp0 - t0)
    from PIL import Image
    import io
    def frame(i): return Image.open(io.BytesIO(base64.b64decode(fr[i][1]))).convert('RGB')
    # pick the frame of each effect at a fixed delay after it starts
    import numpy as np
    def arr(i): return np.asarray(frame(i).crop((0, 40, 760, 300))).astype(int)  # board area, no HUD
    def score(i, kind, ref):
        a = arr(i); R, G, B = a[..., 0], a[..., 1], a[..., 2]
        if kind == 'red': m = (R > 170) & (G < 70) & (B < 70) & (R - ref[..., 0] > 40)
        else: m = (R > 200) & (G > 140) & (a.sum(-1) - ref.sum(-1) > 180)
        return int(m.sum())
    def best(ta, tb, kind):
        idx = [i for i in range(len(fr)) if ta <= fr[i][0] <= tb]
        if not idx: return nearest(ta)
        ref = arr(max(0, idx[0] - 1))
        return max(idx, key=lambda i: score(i, kind, ref))
    picks = (('08-gunshot-hit', best(t_shot0, t_shot0 + 0.9, 'bright')), ('09-gunshot-miss', min(len(fr) - 1, best(t_miss0, t_miss0 + 0.9, 'bright') + 2)),
             ('10-claw-special', best(t_claw0, t_claw0 + 1.0, 'red')), ('11-horn-slam-impact', best(t_imp0, t_imp0 + 1.0, 'bright')), ('12-move-midstep', nearest(t0 + 0.75)))
    for name, i in picks:
        frame(i).save(f'{OUT}/{name}-{VH}.png'); print('frame', name, i, round(fr[i][0] - t0, 2))
    # GIF: move + shot + miss + claw + impact, ~15 fps, 640 wide
    if os.environ.get('GIF', '1') == '1':
        i0, i1 = nearest(t0 + 0.05), len(fr) - 1
        ims = []
        for i in range(i0, i1, 2):
            im = frame(i); w, h = im.size; ims.append(im.resize((480, int(h * 480 / w))).quantize(colors=96, method=Image.Quantize.MEDIANCUT))
        durs = [max(40, int((fr[min(i + 2, i1)][0] - fr[i][0]) * 1000)) for i in range(i0, i1, 2)]
        ims[0].save(f'{OUT}/movement-shot-claw-{VH}.gif', save_all=True, append_images=ims[1:], duration=durs, loop=0, optimize=False)
        print('gif', len(ims))
    b_left = pg.evaluate("window.__game.state.tactics.status")
    br.close()
bad = [e for e in errs if 'favicon' not in e]
print('errors', bad)
assert not bad
print('V014 OK', VH)
