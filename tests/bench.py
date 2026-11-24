# v0.18 performance benchmark: same scenes before/after. Prints JSON.
#  load:   fresh context, no cache: transfer KB, image KB, request count, DOMContentLoaded, base ready, network idle
#  battle: o12 Neon Strip (night + rain), 4v4 squad, 6 s of rAF frame times (avg fps, p95 ms) + CPU profile top
#          self-time functions and GC share
#  base:   Hideout 5 s: fps, CPU busy % (TaskDuration / wall); settings modal open: CPU busy %
# Usage: VH=390 OUT=/tmp/bench.json python3 tests/bench.py
import os, json, time, statistics
from playwright.sync_api import sync_playwright
VH = int(os.environ.get('VH', '390')); URL = os.environ.get('BASE', 'http://localhost:8765/')
OUT = os.environ.get('OUT', '/tmp/bench.json'); SECS = float(os.environ.get('SECS', '6')); QUICK = bool(os.environ.get('QUICK'))  # QUICK=1: battle only
FRAMES = """(secs)=>new Promise(res=>{const d=[];let last=performance.now();const t0=last;function f(t){d.push(t-last);last=t;if(t-t0<secs*1000)requestAnimationFrame(f);else res(d.slice(2));}requestAnimationFrame(f);})"""
def frame_stats(d):
    d = sorted(d); n = len(d)
    return {'frames': n, 'avg_fps': round(1000 / (sum(d) / n), 1), 'p95_ms': round(d[int(n * 0.95) - 1], 1), 'p50_ms': round(d[n // 2], 1), 'max_ms': round(d[-1], 1)}
def close(pg):
    for _ in range(5):
        if not pg.query_selector('.overlay [data-act="closeModal"]'): break
        pg.click('.overlay [data-act="closeModal"] >> nth=-1'); pg.wait_for_timeout(250)
def busy(cdp, pg, secs):
    m0 = {m['name']: m['value'] for m in cdp.send('Performance.getMetrics')['metrics']}
    t0 = time.time(); pg.wait_for_timeout(int(secs * 1000)); t1 = time.time()
    m1 = {m['name']: m['value'] for m in cdp.send('Performance.getMetrics')['metrics']}
    w = t1 - t0
    return {'cpu_busy_pct': round(100 * (m1['TaskDuration'] - m0['TaskDuration']) / w, 1),
            'script_pct': round(100 * (m1['ScriptDuration'] - m0['ScriptDuration']) / w, 1),
            'layout_per_s': round((m1['LayoutCount'] - m0['LayoutCount']) / w, 1),
            'style_recalc_per_s': round((m1['RecalcStyleCount'] - m0['RecalcStyleCount']) / w, 1),
            'heap_mb': round(m1['JSHeapUsedSize'] / 1e6, 1)}
def profile(cdp, pg, secs):
    cdp.send('Profiler.enable'); cdp.send('Profiler.setSamplingInterval', {'interval': 200}); cdp.send('Profiler.start')
    pg.wait_for_timeout(int(secs * 1000))
    prof = cdp.send('Profiler.stop')['profile']
    nodes = {n['id']: n for n in prof['nodes']}; cnt = {}
    for s in prof['samples']: cnt[s] = cnt.get(s, 0) + 1
    tot = len(prof['samples']); agg = {}
    for nid, c in cnt.items():
        cf = nodes[nid]['callFrame']; key = f"{cf['functionName'] or '(anon)'} {cf['url'].split('/')[-1]}:{cf['lineNumber'] + 1}" if cf['url'] else cf['functionName']
        agg[key] = agg.get(key, 0) + c
    top = sorted(agg.items(), key=lambda kv: -kv[1])
    return {'gc_pct': round(100 * agg.get('(garbage collector)', 0) / tot, 1), 'idle_pct': round(100 * agg.get('(idle)', 0) / tot, 1),
            'top': [(k, round(100 * v / tot, 1)) for k, v in top if k not in ('(idle)', '(program)')][:14]}
res = {'vh': VH}
with sync_playwright() as p:
    br = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    # ---- load
    if not QUICK:
      ctx = br.new_context(viewport={'width': 844, 'height': VH}, device_scale_factor=2, is_mobile=True, has_touch=True)
      pg = ctx.new_page(); cdp = ctx.new_cdp_session(pg); cdp.send('Network.enable'); cdp.send('Network.setCacheDisabled', {'cacheDisabled': True})
      reqs = {}
      cdp.on('Network.responseReceived', lambda e: reqs.setdefault(e['requestId'], {}).update(url=e['response']['url'], type=e['type'], status=e['response']['status']))
      cdp.on('Network.loadingFinished', lambda e: reqs.setdefault(e['requestId'], {}).update(bytes=e['encodedDataLength']))
      t0 = time.time(); pg.goto(URL + '?reset=1&fast=1', wait_until='domcontentloaded'); t_dcl = time.time() - t0
      pg.wait_for_selector('#basecv'); t_base = time.time() - t0
      pg.wait_for_load_state('networkidle'); t_idle = time.time() - t0 - 0.5
      pg.wait_for_timeout(300)
      rs = [r for r in reqs.values() if 'url' in r]
      img = [r for r in rs if r['type'] == 'Image' or r['url'].split('?')[0].rsplit('.', 1)[-1] in ('png', 'jpg', 'webp', 'svg')]
      res['load'] = {'requests': len(rs), 'transfer_kb': round(sum(r.get('bytes', 0) for r in rs) / 1024), 'image_requests': len(img),
                     'image_kb': round(sum(r.get('bytes', 0) for r in img) / 1024), 'dcl_ms': round(t_dcl * 1000), 'base_ready_ms': round(t_base * 1000),
                     'network_idle_ms': round(t_idle * 1000), 'http_errors': [r['url'] for r in rs if r.get('status', 200) >= 400],
                     'biggest': sorted(((round(r.get('bytes', 0) / 1024), r['url'].split('/', 3)[-1]) for r in img), reverse=True)[:8]}
      ctx.close()
    # ---- base + battle
    ctx = br.new_context(viewport={'width': 844, 'height': VH}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg = ctx.new_page(); cdp = ctx.new_cdp_session(pg); cdp.send('Performance.enable')
    pg.goto(URL + '?reset=1&fast=1&level=16'); pg.wait_for_selector('#basecv'); pg.wait_for_timeout(1500); close(pg)
    pg.evaluate("localStorage.setItem('fangcity.hints', JSON.stringify({move:1,target:1,end:1}))")
    pg.wait_for_timeout(500)
    if not QUICK: res['base'] = {**frame_stats(pg.evaluate(FRAMES, 5)), **busy(cdp, pg, 4)}
    if not QUICK:
        pg.evaluate("document.querySelector('[data-act=\"openSettings\"]').click()"); pg.wait_for_timeout(600)
        res['base_modal'] = busy(cdp, pg, 3); close(pg)
        pg.evaluate("document.querySelector('[data-act=\"nav\"][data-tab=\"crew\"]').click()"); pg.wait_for_timeout(600)
        res['crew_tab'] = busy(cdp, pg, 3)
    pg.evaluate("(async()=>{const H=await import('./js/core/heroes.js'); const s=window.__game.state; for (const id of ['pip','lumen']) if(!s.heroes.owned[id]) H.grantHero(s,id);})()")
    pg.evaluate("(()=>{const s=window.__game.state; const own=Object.keys(s.heroes.owned); const want=['rook','anvil','lumen','vesper','pip','brick'].filter(i=>own.includes(i)); s.heroes.squad=[...new Set([...want, ...own])].slice(0,4);})()")
    res['squad'] = pg.evaluate("window.__game.state.heroes.squad")
    pg.evaluate("document.querySelector('[data-act=\"nav\"][data-tab=\"missions\"]').click()"); pg.wait_for_timeout(400)
    pg.evaluate("window.__game.fast=false")
    pg.evaluate("document.querySelector('[data-act=\"startOp\"][data-id=\"o12\"]').click()")
    pg.wait_for_selector('.twrap'); pg.wait_for_timeout(2500); close(pg)
    for _ in range(60):
        if pg.evaluate("(()=>{const b=window.__game.state.tactics; const a=b.units.find(x=>x.uid===b.acting); return b.side==='player'&&a&&a.side==='player'})()"): break
        pg.wait_for_timeout(300)
    res['battle_units'] = pg.evaluate("window.__game.state.tactics.units.length")
    pg.wait_for_timeout(800)
    res['battle'] = {**frame_stats(pg.evaluate(FRAMES, SECS)), **busy(cdp, pg, 3)}
    dp = pg.evaluate("window.__tfx.perf && window.__tfx.perf()")
    if dp: res['battle']['draw_js_avg_ms'] = round(dp['avg'], 2); res['battle']['draw_js_p95_ms'] = round(dp['p95'], 2)
    if not QUICK: res['battle_profile'] = profile(cdp, pg, 4)
    # zoomed in 3x on the board centre (wheel)
    pg.mouse.move(422, VH // 2)
    for _ in range(6): pg.mouse.wheel(0, -200); pg.wait_for_timeout(80)
    pg.wait_for_timeout(1500)
    res['battle_zoom'] = {**frame_stats(pg.evaluate(FRAMES, 4)), 'z': pg.evaluate("window.__game.sub.tactics.cam.z")}
    dp = pg.evaluate("window.__tfx.perf && window.__tfx.perf()")
    if dp: res['battle_zoom']['draw_js_avg_ms'] = round(dp['avg'], 2)
    br.close()
json.dump(res, open(OUT, 'w'), indent=1)
print(json.dumps(res, indent=1))
