# Cuts generated sprites off their flat magenta background and writes small WebP files with alpha.
import numpy as np, sys, os
from PIL import Image
from scipy import ndimage
A = '/cursor/stores/user/grok-bot/agents/af325b9c-5802-45ad-aed6-55c512f7df46/assets/'
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'base')
S = {  # name: (source hash prefix, output width px)
 'hq1': ('35c3da6b', 300), 'hq2': ('8a638489', 300), 'hq3': ('a37ea15d', 320),
 'stall': ('9f1e7324', 230), 'carwash': ('5039786e', 300), 'phone': ('ba13a1e6', 220), 'pawn': ('2aec1111', 220),
 'chop': ('84800ad1', 300), 'club': ('7f25362c', 300), 'casino': ('6c75da91', 300), 'crypto': ('05828747', 230),
 'docks': ('5e830dc7', 300), 'radio': ('f9cc77b8', 220), 'pit': ('0fc2e1fb', 300), 'strongbox': ('40c39c50', 220),
 'ledger': ('6cd3d661', 220), 'gym': ('701e962a', 230), 'bunk': ('5ced1c83', 220), 'armoury': ('c999ce9c', 230),
 'family': ('0d903a96', 300), 'sniper': ('9c10e3fe', 200), 'turret': ('73bd1bdf', 220), 'wall': ('1819f662', 90),
 'deadtree': ('4b3f165a', 150), 'tree': ('bcbcdf56', 150), 'bush': ('38e13f9e', 110), 'rubble': ('12e36b95', 100),
 'scrap': ('98cce602', 110), 'tyres': ('e240bb5e', 90), 'wreck': ('7bc6bb3a', 200), 'ruin2': ('40af61d6', 220), 'ruin3': ('9e06dd2d', 320),
}
files = os.listdir(A)
def src(prefix):
    return A + next(f for f in files if f.startswith(prefix))
for name, (pre, width) in S.items():
    im = np.asarray(Image.open(src(pre)).convert('RGB')).astype(np.float32)
    h, w, _ = im.shape
    border = np.concatenate([im[:8].reshape(-1, 3), im[-8:].reshape(-1, 3), im[:, :8].reshape(-1, 3), im[:, -8:].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    d = np.sqrt(((im - bg) ** 2).sum(-1))
    # magenta-ness also helps: background has high R and B, low G
    hard = d < 70
    lab, n = ndimage.label(hard)
    edge_labels = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bgmask = np.isin(lab, list(edge_labels))
    # enclosed holes (fences, lattices, branches): tighter key, skipped where the art itself is pink neon
    if name not in ('club',):
        tight = d < 55
        lab2, n2 = ndimage.label(tight & ~bgmask)
        sizes = ndimage.sum(np.ones_like(d), lab2, range(1, n2 + 1))
        keep = np.zeros(n2 + 1, bool); keep[1:] = sizes >= 12
        bgmask |= keep[lab2]
    # shadows cast onto the magenta backdrop come out dark purple: turn them into soft black shadow (or drop them)
    shadow = np.zeros((h, w), bool)
    if name not in ('club',):
        r0, g0, b0 = im[..., 0], im[..., 1], im[..., 2]
        mag = (np.minimum(r0, b0) - g0 > 28) & (np.abs(r0 - b0) < 90) & ~bgmask
        lab3, n3 = ndimage.label(mag)
        touch = set(np.unique(lab3[ndimage.binary_dilation(bgmask, iterations=2) & mag])) - {0}
        shadow = np.isin(lab3, list(touch))
        bgmask_s = bgmask | shadow
    else:
        bgmask_s = bgmask
    # soft band around the background
    near = ndimage.binary_dilation(bgmask_s, iterations=2) & ~bgmask_s
    alpha = np.ones((h, w), np.float32)
    alpha[bgmask_s] = 0
    lum = im.mean(-1)
    alpha[shadow] = np.clip(1 - lum[shadow] / max(1, bg.mean()), 0, 0.6) * 0.8
    soft = np.clip((d - 70) / 90, 0, 1)
    alpha[near] = np.minimum(alpha[near], soft[near])
    # despill magenta on semi-transparent and edge pixels
    rgb = im.copy()
    spill = near | (ndimage.binary_dilation(bgmask_s, iterations=6) & ~bgmask_s)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    lim = g + 25
    r2 = np.where(spill, np.minimum(r, np.maximum(lim, r * 0.75)), r)
    b2 = np.where(spill, np.minimum(b, np.maximum(lim, b * 0.7)), b)
    rgb[..., 0], rgb[..., 2] = r2, b2
    rgb[shadow] = 0
    out = np.dstack([rgb, alpha * 255]).clip(0, 255).astype(np.uint8)
    ys, xs = np.where(alpha > 0.05)
    out = out[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    img = Image.fromarray(out, 'RGBA')
    hh = round(img.height * width / img.width)
    img = img.resize((width, hh), Image.LANCZOS)
    img.save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=84, method=6)
    print(name, img.size)
# ground textures (tileable)
for name, pre in [('ground', 'a51beb5d'), ('grass', '9ec359ad'), ('asphalt', '53e7e71b')]:
    img = Image.open(src(pre)).convert('RGB').resize((512, 512), Image.LANCZOS)
    img.save(os.path.join(OUT, name + '.jpg'), 'JPEG', quality=80)
print('done')
