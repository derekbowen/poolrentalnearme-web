"""Render a looping hero video from PRNM listing photos (v3).

Usage: python3 render.py <desktop|mobile> <ffmpeg output args...>

v2 changes after review: colour-managed load (ICC -> sRGB), per-edge border trim,
keyframes clamped before interpolation (no mid-shot jerks), constant-speed motion,
smaller zooms, 30 fps, shorter dissolves with a slight dip, BT.709 output.
The timeline is cut so the last frame flows into the first (seamless loop).
"""
import io
import math
import subprocess
import sys

from PIL import Image, ImageCms, ImageOps, ImageStat

FPS = 30

# (image id, start scale, end scale, start center, end center); scale 1.0 = largest crop
# v3 (2026-10-14 second review): 095/161/042 dropped (hoses in the water, soft source);
# five shots at ~4 s each with ~4-5% zoom.
DESKTOP = [
    ('006', 0.97, 0.92, (0.50, 0.55), (0.53, 0.58)),
    ('124', 0.98, 0.93, (0.44, 0.56), (0.47, 0.58)),
    ('160', 1.00, 0.95, (0.50, 0.70), (0.52, 0.71)),
    ('080', 0.97, 0.92, (0.50, 0.50), (0.48, 0.48)),
    ('191', 0.97, 0.92, (0.52, 0.52), (0.55, 0.55)),
]
MOBILE = [
    ('006', 1.00, 0.95, (0.48, 0.55), (0.52, 0.57)),
    ('124', 1.00, 0.95, (0.42, 0.55), (0.45, 0.56)),
    ('160', 1.00, 0.95, (0.56, 0.60), (0.54, 0.62)),
    ('080', 1.00, 0.95, (0.45, 0.50), (0.48, 0.50)),
    ('191', 1.00, 0.95, (0.62, 0.55), (0.65, 0.57)),
]
PRESETS = {
    'desktop': dict(size=(1920, 1080), shots=DESKTOP, clip=4.2, fade=0.5),
    'mobile': dict(size=(720, 1280), shots=MOBILE, clip=4.2, fade=0.5),
}
DIP = 0.03       # brightness dip at the middle of each dissolve
LOOP_DIP = 0.15  # gentler dip for night -> day at the loop point
# Start (and therefore loop) 2 s into the first shot, mid-pan, so the loop point is
# not at the end of a dissolve where encoders starve the last frames.
OFFSET = 2.0
SRGB = ImageCms.createProfile('sRGB')


def to_srgb(im):
    icc = im.info.get('icc_profile')
    im = ImageOps.exif_transpose(im)
    if icc:
        src = ImageCms.ImageCmsProfile(io.BytesIO(icc))
        return ImageCms.profileToProfile(im.convert('RGB'), src, SRGB, outputMode='RGB')
    return im.convert('RGB')


def _flat(strip):
    st = ImageStat.Stat(strip.convert('L'))
    mean, sd = st.mean[0], st.stddev[0]
    return sd < 6 and (mean > 232 or mean < 18)


def trim_border(im, band=60):
    """Remove near-white/black bands within `band` px of each edge, edge by edge."""
    W, H = im.size
    top = max([r + 1 for r in range(band) if _flat(im.crop((0, r, W, r + 1)))], default=0)
    bot = max([r + 1 for r in range(band) if _flat(im.crop((0, H - r - 1, W, H - r)))], default=0)
    lef = max([c + 1 for c in range(band) if _flat(im.crop((c, 0, c + 1, H)))], default=0)
    rig = max([c + 1 for c in range(band) if _flat(im.crop((W - c - 1, 0, W - c, H)))], default=0)
    return im.crop((lef, top, W - rig, H - bot))


def load(img_id):
    return trim_border(to_srgb(Image.open(f'img/{img_id}.jpg')))


def crop_box(im, out_aspect, s, c):
    W, H = im.size
    if W / H > out_aspect:
        mh, mw = H, H * out_aspect
    else:
        mw, mh = W, W / out_aspect
    w, h = mw * s, mh * s
    x = min(max(c[0] * W - w / 2, 0), W - w)
    y = min(max(c[1] * H - h / 2, 0), H - h)
    return (x, y, w, h)


def frame_of(shot, img, size, u, clip):
    _, s0, s1, c0, c1 = shot
    aspect = size[0] / size[1]
    a = crop_box(img, aspect, s0, c0)  # clamp keyframes first ...
    b = crop_box(img, aspect, s1, c1)
    p = max(0.0, min(1.0, u / clip))   # ... then move at constant speed between them
    x, y, w, h = (a[i] + (b[i] - a[i]) * p for i in range(4))
    # resize() with a float box keeps sub-pixel positioning and, unlike
    # transform(EXTENT), antialiases the 0.8-0.9x downscale (less shimmer).
    return img.resize(size, Image.Resampling.LANCZOS, box=(x, y, x + w, y + h))


def smooth(a):
    return a * a * (3 - 2 * a)


def main():
    preset = PRESETS[sys.argv[1]]
    ff_args = sys.argv[2:]
    size, shots, clip, fade = preset['size'], preset['shots'], preset['clip'], preset['fade']
    imgs = [load(s[0]) for s in shots]
    n = len(shots)
    step = clip - fade
    frames = round(n * step * FPS)
    ff = subprocess.Popen(
        ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
         '-s', f'{size[0]}x{size[1]}', '-r', str(FPS), '-i', '-',
         '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
         '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
         '-color_range', 'tv'] + ff_args,
        stdin=subprocess.PIPE)
    for k in range(frames):
        # Start past the first dissolve; frames wrap round so the loop stays seamless.
        t = fade + OFFSET + k / FPS
        i = int(t // step)
        u = t - i * step
        cur = frame_of(shots[i % n], imgs[i % n], size, u, clip)
        if u < fade and i >= 1:
            prev = frame_of(shots[(i - 1) % n], imgs[(i - 1) % n], size, u + step, clip)
            a = smooth(u / fade)
            cur = Image.blend(prev, cur, a)
            dip = (LOOP_DIP if i % n == 0 else DIP) * math.sin(math.pi * a)
            cur = cur.point(lambda v, f=1 - dip: int(v * f))
        ff.stdin.write(cur.tobytes())
    ff.stdin.close()
    sys.exit(ff.wait())


if __name__ == '__main__':
    main()
