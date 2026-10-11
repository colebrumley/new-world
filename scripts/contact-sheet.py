"""One labelled sheet of a folder of the game's baked pictures, to look at and to show in a pull request.

    pixelforge/.venv/bin/python scripts/contact-sheet.py <folder> [scale]

`folder` is one under wiki/images/art/ (terrain, resources, units, places, buildings, goods, portraits,
chart, title): the game's own sprites as PNG files, which `UPDATE_FIXTURES=1 npm test -- test/unit/wiki`
writes from what the game draws now, so run that first after a bake. Each is already enlarged by a
whole number there (a 32-pixel square is 128 pixels across); `scale` enlarges them again by a whole
number, with no smoothing, and is 1 if left out. The pictures are laid out in rows in the order of
their names, each on a neutral ground with its name under it, and the sheet is written to
test-results/sheet-<folder>.png (which git ignores). Needs Pillow and numpy, which pixelforge's
environment has (docs/ART.md).
"""
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
GROUND = (58, 58, 64)  # behind the sheet
CHECKS = ((120, 120, 126), (104, 104, 110))  # behind a picture, so that what is see-through shows as such
INK = (236, 236, 236)
GAP = 12
LABEL = 16
MAX_WIDTH = 1600


def enlarged(path: Path, scale: int) -> Image.Image:
    """The picture with every pixel `scale` x `scale`, laid over the checks wherever it is see-through."""
    rgba = np.array(Image.open(path).convert('RGBA'))
    rgba = np.kron(rgba, np.ones((scale, scale, 1), dtype=np.uint8))
    height, width = rgba.shape[:2]
    ys, xs = np.mgrid[0:height, 0:width]
    odd = ((ys // 8 + xs // 8) % 2).astype(bool)
    ground = np.where(odd[..., None], np.array(CHECKS[1], dtype=np.uint8), np.array(CHECKS[0], dtype=np.uint8))
    shown = np.where(rgba[..., 3:] >= 128, rgba[..., :3], ground)
    return Image.fromarray(shown.astype(np.uint8), 'RGB')


def sheet(folder: str, scale: int) -> Path:
    source = ROOT / 'wiki/images/art' / folder
    paths = sorted(source.glob('*.png'))
    if not paths:
        raise SystemExit(f'no pictures in {source.relative_to(ROOT)}: the folders are ' + ', '.join(sorted(p.name for p in source.parent.iterdir() if p.is_dir())))
    pictures = [(path.stem, enlarged(path, scale)) for path in paths]
    font = ImageFont.load_default()
    cell_w = max(max(picture.width for _, picture in pictures), max(int(font.getlength(name)) for name, _ in pictures)) + GAP
    cell_h = max(picture.height for _, picture in pictures) + LABEL + GAP
    columns = max(1, min(len(pictures), (MAX_WIDTH - GAP) // cell_w, math.ceil(math.sqrt(len(pictures) * cell_h / cell_w) * 1.3)))
    rows = math.ceil(len(pictures) / columns)
    out = Image.new('RGB', (columns * cell_w + GAP, rows * cell_h + GAP), GROUND)
    draw = ImageDraw.Draw(out)
    for n, (name, picture) in enumerate(pictures):
        x, y = GAP + (n % columns) * cell_w, GAP + (n // columns) * cell_h
        out.paste(picture, (x, y))
        draw.text((x, y + picture.height + 2), name, fill=INK, font=font)
    target = ROOT / 'test-results' / f'sheet-{folder}.png'
    target.parent.mkdir(exist_ok=True)
    out.save(target)
    return target


def main() -> None:
    if len(sys.argv) not in (2, 3) or (len(sys.argv) == 3 and not sys.argv[2].isdigit()) or '/' in sys.argv[1] or sys.argv[1].startswith('.'):
        raise SystemExit('usage: contact-sheet.py <folder under wiki/images/art> [scale, a whole number of 1 or more]')
    scale = int(sys.argv[2]) if len(sys.argv) == 3 else 1
    if not 1 <= scale <= 16:
        raise SystemExit('the scale is a whole number from 1 to 16')
    target = sheet(sys.argv[1], scale)
    with Image.open(target) as made:
        print(f'{target.relative_to(ROOT)}: {made.width} x {made.height}')


main()
