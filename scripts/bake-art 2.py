"""Bake the detailed map art from source pictures (visual experiment for R-1006).

    PIXELFORGE=~/Documents/lib/pixelforge  $PIXELFORGE/.venv/bin/python scripts/bake-art.py

art/units holds one square picture per unit type (colonist.png, soldier.png, ...) and art/places one
per look of a colony or native settlement, each a single subject on a flat magenta ground. The
pictures must be our own (constraint C1). Every one is cut from its ground and shrunk by pixelforge,
each folder in one shared palette, and written out as data: src/ui/unit-art.ts and
src/ui/place-art.ts, which pixel-art.ts draws from. In a place, whatever is painted cyan is given
the owner's colour when it is drawn.
"""
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

CODES = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
OWNER = '*'
ROOT = Path(__file__).resolve().parent.parent


def cut_out(path: Path) -> Image.Image:
    """The subject alone, standing on the bottom edge of a square see-through canvas."""
    rgba = np.array(Image.open(path).convert('RGBA')).astype(int)
    r, g, b = rgba[..., 0], rgba[..., 1], rgba[..., 2]
    ground = (r - g > 70) & (b - g > 70)  # magenta and anything tinted by it
    rgba[ground, 3] = 0
    figure = Image.fromarray(rgba.astype(np.uint8), 'RGBA')
    figure = figure.crop(figure.getbbox())
    side = max(figure.size)
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(figure, ((side - figure.width) // 2, side - figure.height))
    return canvas


def bake(folder: str, size: int, palette: int, owner_key: bool) -> tuple[list[str], dict[str, list[str]]]:
    """Every picture in the folder at `size` pixels square: the colours used, and rows of letters per picture."""
    sources = {p.stem: p for p in sorted((ROOT / folder).glob('*.png'))}
    forge = Path(os.environ['PIXELFORGE']).expanduser()
    colours: list[str] = []
    figures: dict[str, list[str]] = {}
    with tempfile.TemporaryDirectory() as tmp:
        cut, out = Path(tmp, 'cut'), Path(tmp, 'out')
        cut.mkdir()
        for name, path in sources.items():
            cut_out(path).save(cut / f'{name}.png')
        subprocess.run(
            [sys.executable, '-m', 'pixelforge', 'batch', str(cut), '-o', str(out), '--preset', 'sprite', '--method', 'box',
             '--no-crop-to-alpha', '--no-key-bg', '--out-width', str(size), '--out-height', str(size),
             '--palette-size', str(palette), '--outline', 'none', '--dither', 'none'],
            cwd=forge, check=True, stdout=subprocess.DEVNULL)
        for name in sources:
            art = np.array(Image.open(out / f'{name}.png').convert('RGBA')).astype(int)
            rows = []
            for line in art:
                row = ''
                for r, g, b, a in line:
                    if a < 128:
                        row += '.'
                    elif owner_key and min(g, b) - r > 60 and abs(g - b) < 60 and max(g, b) > 90:
                        row += OWNER  # cyan, or cyan darkened by the outline beside it: the owner's colour
                    else:
                        colour = f'#{r:02x}{g:02x}{b:02x}'
                        if colour not in colours:
                            colours.append(colour)
                        row += CODES[colours.index(colour)]
                rows.append(row)
            figures[name] = rows
    return colours, figures


def write(path: str, title: str, prefix: str, size_name: str, size: int, colours: list[str], figures: dict[str, list[str]], note: str) -> None:
    lines = [
        f'// {title}, made by scripts/bake-art.py from our own pictures (constraint C1). Do not edit by hand.',
        '',
        '/** The colours this art is drawn in, beyond the 32 of the map palette. */',
        f'export const {prefix}_COLORS = [' + ', '.join(f"'{c}'" for c in colours) + '] as const;',
        '',
        '/** How many art pixels square a picture is at most. */',
        f'export const {size_name} = {size};',
        '',
        f'/** The letter each of {prefix}_COLORS goes by, in order. */',
        f"export const {prefix}_CODES = '{CODES}';",
        '',
        f'/** {note} */',
        f'export const {prefix}_ART: Readonly<Record<string, readonly string[]>> = {{',
    ]
    for name, rows in figures.items():
        lines.append(f'  {name}: [')
        lines += [f"    '{row}'," for row in rows]
        lines.append('  ],')
    lines += ['};', '']
    (ROOT / path).write_text('\n'.join(lines))
    print(f'{path}: {len(figures)} pictures, {len(colours)} colours')


def main() -> None:
    colours, figures = bake('art/units', 30, 32, False)
    write('src/ui/unit-art.ts', 'Unit figures for the map', 'UNIT', 'FIGURE_SIZE', 30, colours, figures,
          'One figure per unit type: rows of letters from UNIT_CODES; a full stop is see-through.')
    colours, figures = bake('art/places', 32, 24, True)
    write('src/ui/place-art.ts', 'Colonies and native settlements for the map', 'PLACE', 'PLACE_SIZE', 32, colours, figures,
          "One picture per look of a place: rows of letters from PLACE_CODES; '*' is the owner's colour and a full stop is see-through.")


main()
