"""Shrink the source pictures in art/ in place (run once on a new picture, before scripts/bake-art.py).

    pixelforge/.venv/bin/python scripts/shrink-art.py [FILE...]      # every PNG under art/ if none is named

A generated picture looks flat but carries a faint grain over every area, which a PNG cannot pack:
about 1.3 MB for a 1254 x 1254 picture of a dozen colours. This takes the grain out and saves the
picture with a palette, at the same size in pixels: a median filter, a cut to 64 colours, colours
within TOLERANCE of a commoner one folded into it, and stray pixels given their neighbours'
colour. Edges lose their smoothing, which does not show at this size. A picture that already has
a palette is left alone. Needs Pillow and numpy, which pixelforge's environment has.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

TOLERANCE = 12
ROOT = Path(__file__).resolve().parent.parent


def shrink(path: Path) -> tuple[int, int] | None:
    picture = Image.open(path)
    if picture.mode == 'P':
        return None
    before = path.stat().st_size
    # (an octree, not the default median cut, which gives a small patch of strong colour, a red pennant in a
    # wide picture, away to the browns around it)
    cut = picture.convert('RGB').filter(ImageFilter.MedianFilter(5)).quantize(64, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    palette = np.array(cut.getpalette()[:192]).reshape(-1, 3).astype(int)
    pixels = np.array(cut)
    counts = np.bincount(pixels.ravel(), minlength=64)
    kept: list[int] = []
    fold = np.arange(64)
    for colour in np.argsort(-counts, kind='stable'):
        near = next((k for k in kept if np.abs(palette[colour] - palette[k]).max() <= TOLERANCE), None)
        if near is None:
            kept.append(int(colour))
        else:
            fold[colour] = near
    flat = Image.fromarray(fold[pixels].astype(np.uint8), 'P')
    flat.putpalette(cut.getpalette())
    flat.filter(ImageFilter.ModeFilter(3)).save(path, 'PNG', optimize=True)
    return before, path.stat().st_size


def main() -> None:
    paths = [Path(p) for p in sys.argv[1:]] or sorted((ROOT / 'art').rglob('*.png'))
    before = after = 0
    for path in paths:
        sizes = shrink(path)
        if sizes:
            before, after = before + sizes[0], after + sizes[1]
    print(f'{len(paths)} pictures: {before // 1024} KB -> {after // 1024} KB')


main()
