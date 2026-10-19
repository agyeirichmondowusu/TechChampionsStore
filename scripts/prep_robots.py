"""Cut the robot photos out of their white backgrounds for the scroll-assembly view.
Run once: python3 scripts/prep_robots.py <uploads_dir> <spi_hex_path>"""
import sys, os, glob, shutil
from PIL import Image, ImageDraw, ImageFilter

up, hexpath = sys.argv[1], sys.argv[2]
def f(name): return glob.glob(os.path.join(up, f'*-{name}'))[0]
OUT = 'public/robots'
MAGIC = (255, 0, 255)

def cutout(src, crop=None, thresh=28, size=900):
    im = Image.open(src).convert('RGB')
    if crop:
        w, h = im.size
        im = im.crop(tuple(int(v * (w if i % 2 == 0 else h)) for i, v in enumerate(crop)))
    work = im.copy()
    w, h = work.size
    step = max(1, w // 40)
    seeds = [(x, 0) for x in range(0, w, step)] + [(x, h - 1) for x in range(0, w, step)] + \
            [(0, y) for y in range(0, h, step)] + [(w - 1, y) for y in range(0, h, step)]
    for s in seeds:
        if work.getpixel(s) != MAGIC:
            ImageDraw.floodfill(work, s, MAGIC, thresh=thresh)
    mask = Image.new('L', (w, h), 255)
    mp, wp = mask.load(), work.load()
    for y in range(h):
        for x in range(w):
            if wp[x, y] == MAGIC:
                mp[x, y] = 0
    mask = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    rgba = im.convert('RGBA'); rgba.putalpha(mask)
    bbox = mask.point(lambda v: 255 if v > 40 else 0).getbbox()
    rgba = rgba.crop(bbox)
    pad = int(max(rgba.size) * 0.04)
    side = max(rgba.size) + pad * 2
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(rgba, ((side - rgba.width) // 2, side - rgba.height - pad))  # feet on the ground line
    return canvas.resize((size, size), Image.LANCZOS)

robots = {
    'spiderpi': dict(main=f('spider.webp'), gallery=['spider_parts.webp', 'spider_product_structure.webp', 'spi.webp']),
    'spiderpi-pro': dict(main=f('SpiderPi_Pro_arm.webp'), gallery=['spider_product_structure.webp']),
    'jethexa': dict(main=hexpath, gallery=['spider_lidar.webp']),
    'puppypi': dict(main=f('dog.webp'), gallery=['dogparts.webp']),
    'mecanum-car': dict(main=f('car_ar.webp'), crop=(0.22, 0.38, 0.79, 0.76), gallery=['car_exploded.webp', 'car_ar.webp']),
    'zorin': dict(main=f('car_zorin.webp'), gallery=['car_zorin_exploded.webp']),
    'ackermann': dict(main=f('car.webp'), crop=(0.0, 0.1, 1.0, 0.92), gallery=['car2.webp', 'car.webp'], raw=True),
    'robotic-arm': dict(main=f('robotic_arm.webp'), crop=(0.5, 0.0, 1.0, 1.0), gallery=['robotic_arm.webp']),
}
for rid, r in robots.items():
    d = os.path.join(OUT, rid); os.makedirs(d, exist_ok=True)
    if r.get('raw'):
        im = Image.open(r['main']).convert('RGB')
        w, h = im.size; c = r['crop']
        im = im.crop((int(c[0]*w), int(c[1]*h), int(c[2]*w), int(c[3]*h))).resize((900, int(900*(c[3]-c[1])*h/((c[2]-c[0])*w))))
        im.save(os.path.join(d, 'main.webp'), quality=85)
    else:
        cutout(r['main'], r.get('crop')).save(os.path.join(d, 'main.webp'), quality=88)
    for g in r['gallery']:
        Image.open(f(g)).convert('RGB').save(os.path.join(d, g.replace(' ', '_')), quality=82)
    print(rid, 'ok')
