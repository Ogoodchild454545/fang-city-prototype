# v0.12 playthrough: Anvil (rhino Tank) joins at player Lv 10; crew tab, character sheet, abilities,
# portrait and an op where he braces and taunts. Run at VH=390 and VH=340.
import os
from playwright.sync_api import sync_playwright
OUT = os.environ.get('SHOTS', '/workspace/shots-v012'); os.makedirs(OUT, exist_ok=True)
VH = int(os.environ.get('VH', '390'))
URL = os.environ.get('BASE', 'http://localhost:8765/')
errs = []
def shot(pg, n): pg.wait_for_timeout(400); pg.screenshot(path=f'{OUT}/{n}-{VH}.png'); print('shot', n)
def close(pg):
    for _ in range(4):
        if not pg.query_selector('.overlay [data-act="closeModal"]'): break
        pg.click('.overlay [data-act="closeModal"] >> nth=-1'); pg.wait_for_timeout(250)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg = b.new_page(viewport={'width': 844, 'height': VH}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.goto(URL + '?reset=1&fast=1&level=9'); pg.wait_for_selector('#basecv'); pg.wait_for_timeout(700); close(pg)
    assert not pg.evaluate("!!window.__game.state.heroes.owned.anvil"), 'not before Lv 10'
    pg.goto(URL + '?fast=1&level=10'); pg.wait_for_selector('#basecv'); pg.wait_for_timeout(700); close(pg)
    s = pg.evaluate("(()=>{const s=window.__game.state; return {v:s.v, owned:Object.keys(s.heroes.owned), eq:s.heroes.owned.anvil && s.heroes.owned.anvil.equip}})()")
    print('lv10', s); assert s['v'] == 9 and 'anvil' in s['owned'], s
    pg.click('#nav [data-act="nav"][data-tab="crew"]'); pg.wait_for_timeout(400)
    pg.click('[data-act="crewPick"][data-id="anvil"]'); pg.wait_for_timeout(500)
    shot(pg, '01-crew-tab')
    pg.click('.armymain [data-act="openHero"][data-id="anvil"] >> nth=-1'); pg.wait_for_timeout(600)
    assert pg.query_selector('.charscr'), 'sheet open'
    shot(pg, '02-character-sheet')
    pg.click('[data-act="charTab"][data-t="skills"]'); pg.wait_for_timeout(300)
    shot(pg, '03-abilities')
    pg.click('[data-act="charBack"]'); pg.wait_for_timeout(300)
    # squad: Anvil + Rook, start an op
    pg.evaluate("(()=>{const s=window.__game.state; s.heroes.squad=['anvil','rook'];})()")
    pg.click('#nav [data-act="nav"][data-tab="missions"]'); pg.wait_for_timeout(400)
    pg.click('[data-act="startOp"] >> nth=0'); pg.wait_for_selector('.twrap', timeout=10000); pg.wait_for_timeout(1500)
    close(pg)
    # wait for Anvil's go (he is slow), let the AI play enemies
    for _ in range(60):
        if pg.evaluate("(()=>{const b=window.__game.state.tactics; const u=b && b.units.find(x=>x.uid===b.acting); return !!(u && u.hero==='anvil')})()"): break
        pg.wait_for_timeout(500)
        pg.evaluate("(()=>{const b=window.__game.state.tactics; const u=b && b.units.find(x=>x.uid===b.acting); if (u && u.side==='player' && u.hero!=='anvil') document.querySelector('[data-act=\"endTacticsTurn\"]')?.click();})()")
    pg.wait_for_timeout(800)
    shot(pg, '04-battle-anvil')
    if pg.query_selector('[data-mode="brace"]:not([disabled])'):
        pg.click('[data-mode="brace"]'); pg.wait_for_timeout(500); shot(pg, '05-battle-brace')
    if pg.query_selector('[data-mode="taunt"]:not([disabled])'):
        pg.click('[data-mode="taunt"]'); pg.wait_for_timeout(500); shot(pg, '06-battle-taunt')
    st = pg.evaluate("(()=>{const b=window.__game.state.tactics; const a=b.units.find(x=>x.hero==='anvil'); return {brace:a.brace, cd:a.cd, hp:a.hp, maxHp:a.maxHp, armor:a.armor, speed:a.speed, move:a.move}})()")
    print('anvil in battle', st)
    b.close()
bad = [e for e in errs if 'favicon' not in e]
print('errors', bad)
assert not bad
print('ANVIL OK', VH)
