# v0.22: cuts the painted Docklands props off their flat magenta background into small WebP sprites with alpha.
# Usage: python3 tools/cut_props.py   (sources live in the bot's asset store; outputs in assets/props/docklands)
import numpy as np, os
from PIL import Image, ImageFilter
from scipy import ndimage
A = '/cursor/stores/user/grok-bot/agents/af325b9c-5802-45ad-aed6-55c512f7df46/assets/'
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'props', 'docklands')
S = {  # name: (source hash prefix, output width px)
  'truck-grey': ('3025ba95', 560), 'van-white': ('ba2897ea', 560), 'van-dark': ('1ca5ea37', 560), 'truck-wreck': ('7a2efdc8', 560),
  'crate-wood': ('33ae75b4', 220), 'crate-wrap': ('3f37ab27', 220), 'crate-steel': ('d33ca947', 220),
  'barrier-yellow': ('99c1bed4', 220), 'barrier-red': ('e5774318', 220),
  'barrel-red': ('f60b2fec', 110), 'barrel-burn': ('e9934653', 110), 'barrel-wreck': ('3efaa628', 120),
  'lamp': ('18bf048e', 120), 'tug': ('9efac850', 300), 'desk': ('a81b48c3', 220), 'shelf': ('5d0a1c06', 220), 'bollard': ('13f95348', 70), 'tyres': ('2d3f1f21', 200),
}
FIX = {  # blank out small painted lettering (number plates) before cutting: (x0, y0, x1, y1) in source px
  'van-white': [(728, 474, 772, 502)],
}
files = os.listdir(A)
def src(prefix): return A + next(f for f in files if f.startswith(prefix))
os.makedirs(OUT, exist_ok=True)
for name, (pre, width) in S.items():
    img0 = Image.open(src(pre)).convert('RGB')
    im = np.asarray(img0).astype(np.float32).copy()
    for (x0, y0, x1, y1) in FIX.get(name, []):
        patch = im[y0:y1, x0:x1]
        im[y0:y1, x0:x1] = np.median(patch.reshape(-1, 3), axis=0) * 0.8
    h, w, _ = im.shape
    r0, g0, b0 = im[..., 0], im[..., 1], im[..., 2]
    border = np.concatenate([im[:6].reshape(-1, 3), im[-6:].reshape(-1, 3), im[:, :6].reshape(-1, 3), im[:, -6:].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    d = np.sqrt(((im - bg) ** 2).sum(-1))
    # magenta-ish (incl. dark purple shadows cast on the backdrop): R and B well above G, R close to B
    mag = (np.minimum(r0, b0) - g0 > 40) & (np.abs(r0 - b0) < 80)
    hard = (d < 80) | mag
    lab, n = ndimage.label(hard)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bgm = np.isin(lab, list(edge))
    # enclosed holes (roof racks, shelving, lamp arm)
    lab2, n2 = ndimage.label((d < 60) & ~bgm)
    if n2:
        sizes = ndimage.sum(np.ones_like(d), lab2, range(1, n2 + 1))
        keep = np.zeros(n2 + 1, bool); keep[1:] = sizes >= 10
        bgm |= keep[lab2]
    # purple cast shadows touching the backdrop
    pur = (np.minimum(r0, b0) - g0 > 18) & (np.abs(r0 - b0) < 70) & ~bgm
    lab3, n3 = ndimage.label(pur)
    touch = set(np.unique(lab3[ndimage.binary_dilation(bgm, iterations=2) & pur])) - {0}
    bgm |= np.isin(lab3, list(touch))
    # enclosed magenta holes (inside a tyre, between rack bars)
    lab4, n4 = ndimage.label(mag & ~bgm)
    if n4:
        sz4 = ndimage.sum(np.ones_like(d), lab4, range(1, n4 + 1))
        k4 = np.zeros(n4 + 1, bool); k4[1:] = sz4 >= 6
        bgm |= k4[lab4]
    bgm = ndimage.binary_opening(bgm, iterations=1) | (d < 40)
    alpha = np.where(bgm, 0.0, 1.0).astype(np.float32)
    near = ndimage.binary_dilation(bgm, iterations=2) & ~bgm
    soft = np.clip((d - 70) / 110, 0, 1)
    alpha[near] = np.minimum(alpha[near], soft[near])
    # despill
    spill = ndimage.binary_dilation(bgm, iterations=5) & ~bgm
    lim = g0 + 18
    im[..., 0] = np.where(spill, np.minimum(r0, np.maximum(lim, r0 * 0.8)), r0)
    im[..., 2] = np.where(spill, np.minimum(b0, np.maximum(lim, b0 * 0.7)), b0)
    # leftover magenta tint in shaded areas (no Docklands prop is meant to be purple)
    r1, g1, b1 = im[..., 0], im[..., 1], im[..., 2]
    pt = (np.minimum(r1, b1) - g1 > 10) & (np.abs(r1 - b1) < 60)
    im[..., 0] = np.where(pt, np.minimum(r1, g1 + 10), r1)
    im[..., 2] = np.where(pt, np.minimum(b1, g1 + 10), b1)
    a8 = Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))
    out = Image.fromarray(im.clip(0, 255).astype(np.uint8), 'RGB'); out.putalpha(a8)
    bb = out.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox()
    out = out.crop(bb)
    hh = round(out.height * width / out.width)
    out = out.resize((width, hh), Image.LANCZOS)
    out.save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=82, method=6)
    print(name, out.size, os.path.getsize(os.path.join(OUT, name + '.webp')))
# container side texture: greyscale, tinted per container in code
t = Image.open(src('b6a82d0b')).convert('L').resize((384, 216), Image.LANCZOS)
t.save(os.path.join(OUT, 'container-tex.webp'), 'WEBP', quality=72, method=6)
print('container-tex', os.path.getsize(os.path.join(OUT, 'container-tex.webp')))
