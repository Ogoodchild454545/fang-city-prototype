# v0.17 UI audit: visits every screen at 844xVH, screenshots it, and reports tap targets under the
# minimum and clipped text. MIN=44 for primary actions (.btn.red/.btn.primary/main CTAs), 36 for the rest.
# Usage: VH=390|340 OUT=dir STRICT=1 python3 tests/ui_audit.py
import os, json
from playwright.sync_api import sync_playwright
VH = int(os.environ.get('VH', '390')); OUT = os.environ.get('OUT', '/tmp/aud'); os.makedirs(OUT, exist_ok=True)
URL = os.environ.get('BASE', 'http://localhost:8765/'); STRICT = os.environ.get('STRICT') == '1'
errs = []
AUDIT = r"""(()=>{
  const vis=(el)=>{const r=el.getBoundingClientRect(); if(r.width<2||r.height<2) return null; const cs=getComputedStyle(el); if(cs.visibility==='hidden'||cs.display==='none'||+cs.opacity===0) return null;
    if(r.bottom<0||r.right<0||r.top>innerHeight||r.left>innerWidth) return null; return r;};
  // topmost layer only: if a modal is open, audit the modal
  const root=[...document.querySelectorAll('.overlay')].pop()||document.body;
  const small=[], clip=[];
  for (const el of root.querySelectorAll('button,[data-act]')) {
    const r=vis(el); if(!r) continue;
    if (el.closest('.tinsp .tists')) continue;
    const primary=el.matches('.btn.red:not(.sm),.btn.primary,.btn.gold:not(.sm),.cta,[data-act="startOp"],[data-act="confirmLoadout"],[data-act="claimJob"],[data-act="claimDaily"],[data-act="upgrade"],[data-act="fxCollect"],[data-act="fxCraft"],[data-act="tconfirm"],[data-act="tmoveGo"],[data-act="endTacticsTurn"],[data-act="buy"],[data-act="collectB"],[data-act="sendJob"],[data-act="raid"]');
    const close=el.matches('[data-act="closeModal"],[data-act="closeInspect"],.x,.tix');
    const need=primary?44:close?36:30;
    // the effective hit box counts padding from ::before hit-slop helpers too
    const h=Math.max(r.height, parseFloat(el.dataset.hit||0)), w=Math.max(r.width, parseFloat(el.dataset.hit||0));
    if (Math.min(h, w) < need - 0.5) small.push({act:el.dataset.act||el.className, txt:(el.innerText||'').trim().slice(0,24), w:Math.round(w), h:Math.round(h), need});
  }
  for (const el of root.querySelectorAll('*')) {
    if (el.children.length) continue; const t=(el.textContent||'').trim(); if(!t) continue; const r=vis(el); if(!r) continue;
    const cs=getComputedStyle(el);
    if (cs.textOverflow!=='ellipsis' && (cs.overflow==='hidden'||cs.overflowX==='hidden') && el.scrollWidth>el.clientWidth+2) clip.push({txt:t.slice(0,30), cls:el.className, sw:el.scrollWidth, cw:el.clientWidth});
  }
  return {small, clip};
})()"""
def close(pg):
    for _ in range(5):
        if not pg.query_selector('.overlay [data-act="closeModal"]'): break
        pg.click('.overlay [data-act="closeModal"] >> nth=-1'); pg.wait_for_timeout(250)
report = {}
def audit(pg, name):
    pg.wait_for_timeout(450); pg.screenshot(path=f'{OUT}/ui-{name}-{VH}.png')
    r = pg.evaluate(AUDIT); report[name] = r
    print(name, 'small', len(r['small']), 'clip', len(r['clip']))
    for s in r['small'][:12]: print('   small', s)
    for c in r['clip'][:8]: print('   clip', c)
def act(pg, sel):
    return pg.evaluate(f"(()=>{{const b=document.querySelector('{sel}'); if(!b) return false; b.click(); return true}})()")
with sync_playwright() as p:
    br = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg = br.new_page(viewport={'width': 844, 'height': VH}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.goto(URL + '?reset=1&fast=1&level=16'); pg.wait_for_selector('#basecv'); pg.wait_for_timeout(900); close(pg)
    pg.evaluate("localStorage.setItem('fangcity.hints', JSON.stringify({move:1,target:1,end:1}))")
    audit(pg, 'base')
    for fac in ('Factory', 'Clinic'):
        try:
            pg.evaluate(f"(async()=>{{const F=await import('./js/ui/facilities.js'); F.open{fac}(window.__game);}})()"); audit(pg, fac.lower()); close(pg)
        except Exception as ex: print('skip', fac, ex)
    if act(pg, '[data-act="openBuild"]'): audit(pg, 'build'); close(pg)
    if act(pg, '[data-act="openSettings"]'): audit(pg, 'settings'); close(pg)
    for tab in ('crew', 'missions', 'jobs', 'city', 'shop'):
        if act(pg, f'[data-act="nav"][data-tab="{tab}"]'): pg.wait_for_timeout(400); close(pg); audit(pg, tab)
    act(pg, '[data-act="nav"][data-tab="crew"]'); pg.wait_for_timeout(300)
    if act(pg, '[data-act="crewTab"][data-id="ops"],[data-act="crewTab"]:nth-of-type(2)'): pg.wait_for_timeout(300); audit(pg, 'operators')
    if act(pg, '[data-act="openHero"]'): pg.wait_for_timeout(600); audit(pg, 'hero')
    if act(pg, '[data-act="charTab"][data-id="gear"]'): pg.wait_for_timeout(300); audit(pg, 'hero-gear')
    pg.goto(URL + '?fast=1'); pg.wait_for_selector('#basecv'); pg.wait_for_timeout(600); close(pg)
    act(pg, '[data-act="nav"][data-tab="missions"]'); pg.wait_for_timeout(300)
    act(pg, '[data-act="startOp"][data-id="o5"]'); pg.wait_for_timeout(800)
    if pg.query_selector('[data-act="confirmLoadout"]'): audit(pg, 'loadout'); act(pg, '[data-act="confirmLoadout"]')
    pg.wait_for_selector('.twrap', timeout=10000); pg.wait_for_timeout(2400); close(pg)
    audit(pg, 'battle')
    br.close()
json.dump(report, open(f'{OUT}/ui-audit-{VH}.json', 'w'), indent=1)
print('errors', errs)
bad = {k: v['small'] for k, v in report.items() if any(s['need'] == 44 for s in v['small'])}
clipped = {k: v['clip'] for k, v in report.items() if v['clip']}
print('primary under 44:', sum(len([s for s in v if s['need'] == 44]) for v in bad.values()), ' clipped:', sum(len(v) for v in clipped.values()))
if STRICT:
    assert not errs, errs
    assert not bad, json.dumps(bad)[:800]
    assert not clipped, json.dumps(clipped)[:800]
print('UI AUDIT DONE', VH)
