#!/usr/bin/env python3
"""生成内置示例照片（渐变 + 图形 + 编号），供 3D 照片墙离线兜底使用。
用法: python3 scripts/generate_samples.py [数量]
输出: public/samples/sample-0.jpg ...（300x400 JPEG）
"""
import os
import sys
import math
from PIL import Image, ImageDraw, ImageFont

COUNT = int(sys.argv[1]) if len(sys.argv) > 1 else 24
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'samples')
W, H = 300, 400
os.makedirs(OUT, exist_ok=True)


def hsv2rgb(h, s, v):
    i = int(h * 6)
    f = h * 6 - i
    p, q, t = v * (1 - s), v * (1 - s * f), v * (1 - s * (1 - f))
    return [(v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q)][i % 6]


for i in range(COUNT):
    img = Image.new('RGB', (W, H))
    d = ImageDraw.Draw(img)
    hue = (i / COUNT) % 1.0
    # 对角渐变
    for y in range(H):
        t = y / H
        r = int(18 + 60 * t)
        g = int(14 + 50 * t)
        b = int(40 + 70 * t)
        d.line([(0, y), (W, y)], fill=(r, g, b))
    # 装饰圆
    for k in range(5):
        cx = (k * 73 + i * 37) % W
        cy = (k * 91 + i * 53) % H
        rad = 20 + ((i * 7 + k * 13) % 40)
        c = tuple(int(c * 255) for c in hsv2rgb((hue + k * 0.13) % 1.0, 0.55, 0.95))
        d.ellipse([cx - rad, cy - rad, cx + rad, cy + rad], fill=c)
    # 编号
    try:
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 64)
    except OSError:
        font = ImageFont.load_default()
    txt = f'#{i:02d}'
    bbox = d.textbbox((0, 0), txt, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text(((W - tw) / 2, (H - th) / 2), txt, font=font, fill=(255, 255, 255))
    d.text(((W - tw) / 2, (H - th) / 2 + th + 10), 'CAMPUS', font=font, fill=(120, 220, 255))
    out = os.path.join(OUT, f'sample-{i}.jpg')
    img.save(out, 'JPEG', quality=80)
    print(out)

print(f'OK: {COUNT} 张示例照片 -> {OUT}')
