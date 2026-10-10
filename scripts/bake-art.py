"""Bake the detailed map art from source pictures (visual experiment for R-1006).

    git clone https://github.com/colebrumley/pixelforge && (cd pixelforge && uv sync)
    PIXELFORGE=pixelforge pixelforge/.venv/bin/python scripts/bake-art.py

The pictures are shrunk by pixelforge (https://github.com/colebrumley/pixelforge); PIXELFORGE is the
path to a checkout of it, and the script is run with that checkout's Python.

art/units holds one square picture per unit type (colonist.png, soldier.png, ...), art/places one
per look of a colony or native settlement, and art/features one per forest, hills and mountains,
each a single subject on a flat magenta ground. art/floors holds one ground texture per open
terrain, filling its square. The pictures must be our own (constraint C1). Every one is cut from
its ground (a floor is not), shrunk by pixelforge (units and places in one shared palette per
folder, terrain in a few flat colours per picture), and written
out as data: src/ui/unit-art.ts, place-art.ts, feature-art.ts and floor-art.ts, which pixel-art.ts
draws from. In a place, whatever is painted cyan is given the owner's colour when it is drawn. A
floor is shifted so that its commonest colour is the terrain's colour on the minimap.

art/chart holds the explorer's chart the unexplored map is drawn as: the vellum floor, the compass
rose and the chart's creatures, each at 32, 16 and 8 pixels to the square. They are drawn by
scripts/draw-chart.py at their final size in six inks of the map palette, so they are written out
as they are, with no shrinking and no colours of their own (src/ui/chart-art.ts). That step alone
does not need pixelforge:

    uv run --with pillow scripts/draw-chart.py && uv run --with pillow --with numpy scripts/bake-art.py chart
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
# The ground colour of each terrain that has a floor: GROUND in src/ui/pixel-art.ts, as colours.
FLOOR_COLOURS = {
    'ocean': '#1f4e79', 'seaLane': '#173d61', 'arctic': '#e6edf2', 'tundra': '#9aa58c', 'desert': '#d3bd7a', 'plains': '#b9b45a',
    'prairie': '#c9a857', 'grassland': '#7fae4e', 'savannah': '#a3b548', 'marsh': '#6f9471', 'swamp': '#56765c', 'hills': '#a39262',
    'mountains': '#8d8a84',
}


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


# The features whose clump leaves bare ground showing at the corners of the square, picked by eye:
# these are baked with a second row behind. The others already fill their square, and a second row
# only clutters them.
TWO_ROWS = {'boreal', 'broadleaf', 'wetland', 'hills'}


def stand(path: Path) -> Image.Image:
    """
    A forest, hills or mountains on its square. For those in TWO_ROWS the clump is drawn twice, a second
    copy behind the first moved half a square sideways (wrapping round), so that squares side by side read
    as one wood and not as rows of clumps with bare ground between.
    """
    clump = cut_out(path)
    if path.stem not in TWO_ROWS:
        return clump
    front = clump.crop(clump.getbbox())
    side = front.width
    square = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    back = Image.new('RGBA', (side, front.height), (0, 0, 0, 0))
    back.paste(front, (side // 2, 0))
    back.paste(front, (side // 2 - side, 0))
    square.alpha_composite(back, (0, 0))
    square.alpha_composite(front, (0, max(0, side - front.height)))
    return square


def floor(path: Path) -> Image.Image:
    """A ground texture without its outermost edge, shifted so its commonest colour is the terrain's own."""
    picture = Image.open(path).convert('RGB')
    trim = picture.width // 32
    rgb = np.array(picture.crop((trim, trim, picture.width - trim, picture.height - trim))).astype(int)
    want = FLOOR_COLOURS[path.stem]
    target = np.array([int(want[i:i + 2], 16) for i in (1, 3, 5)])
    coarse = (rgb // 8).reshape(-1, 3)
    values, counts = np.unique(coarse, axis=0, return_counts=True)
    commonest = values[counts.argmax()] * 8 + 4
    return Image.fromarray(np.clip(rgb + (target - commonest), 0, 255).astype(np.uint8), 'RGB')


def bake(folder: str, size: int, palette: int, owner_key: bool = False, prepare=cut_out, shared: bool = True) -> tuple[list[str], dict[str, list[str]]]:
    """
    Every picture in the folder at `size` pixels square: the colours used, and rows of letters per picture.
    The folder shares one palette of `palette` colours, or, with `shared` off, each picture is cut down to
    that many colours of its own, which keeps a simple picture flat and free of in-between shades.
    """
    sources = {p.stem: p for p in sorted((ROOT / folder).glob('*.png'))}
    forge = Path(os.environ['PIXELFORGE']).expanduser()
    colours: list[str] = []
    figures: dict[str, list[str]] = {}
    with tempfile.TemporaryDirectory() as tmp:
        ready, out = Path(tmp, 'ready'), Path(tmp, 'out')
        ready.mkdir()
        for name, path in sources.items():
            prepare(path).save(ready / f'{name}.png')
        flags = ['--preset', 'sprite', '--method', 'box', '--no-crop-to-alpha', '--no-key-bg', '--out-width', str(size), '--out-height', str(size),
                 '--palette-size', str(palette), '--outline', 'none', '--dither', 'none']
        jobs = [['batch', str(ready)]] if shared else [['convert', str(ready / f'{name}.png'), '--orphan-min-region', '3'] for name in sources]
        for job in jobs:
            subprocess.run([sys.executable, '-m', 'pixelforge', *job, '-o', str(out), *flags], cwd=forge, check=True, stdout=subprocess.DEVNULL)
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


def level(colours: list[str], figures: dict[str, list[str]]) -> list[str]:
    """Give each floor's commonest colour exactly its terrain's colour, so the ground is one flat colour that matches the minimap."""
    colours = list(colours)
    for name, rows in figures.items():
        letters = ''.join(rows)
        base = max(set(letters), key=letters.count)
        want = FLOOR_COLOURS[name]
        if want not in colours:
            colours.append(want)
        figures[name] = [row.replace(base, CODES[colours.index(want)]) for row in rows]
    used = sorted({letter for rows in figures.values() for row in rows for letter in row}, key=CODES.index)
    for name, rows in figures.items():
        figures[name] = [''.join(CODES[used.index(letter)] for letter in row) for row in rows]
    return [colours[CODES.index(letter)] for letter in used]


# The inks the chart is drawn in, by the letter each goes by: entries of PALETTE in src/ui/pixel-art.ts.
CHART_INKS = {'p': '#e9dfc4', 's': '#d3bd7a', 'h': '#a39262', 'e': '#7c6b45', 'w': '#6b4a2a', 'k': '#111111'}


def chart() -> None:
    """The chart pictures as data, pixel for pixel: every one must already be in the chart inks alone."""
    letter = {colour: code for code, colour in CHART_INKS.items()}
    figures: dict[str, list[str]] = {}
    for path in sorted((ROOT / 'art/chart').glob('*.png')):
        rows = []
        for line in np.array(Image.open(path).convert('RGBA')).astype(int):
            row = ''
            for r, g, b, a in line:
                colour = f'#{r:02x}{g:02x}{b:02x}'
                if a >= 128 and colour not in letter:
                    raise SystemExit(f'{path.name}: {colour} is not one of the chart inks')
                row += letter[colour] if a >= 128 else '.'
            rows.append(row)
        figures[path.stem] = rows
    lines = [
        "// The explorer's chart the unexplored map is drawn as, made by scripts/bake-art.py from our own pictures",
        '// (art/chart, drawn by scripts/draw-chart.py; constraint C1). Do not edit by hand.',
        '',
        '/** The colours this art is drawn in: six of the 32 of the map palette, and no others. */',
        'export const CHART_COLORS = [' + ', '.join(f"'{c}'" for c in CHART_INKS.values()) + '] as const;',
        '',
        '/** The letter each of CHART_COLORS goes by, in order. */',
        f"export const CHART_CODES = '{''.join(CHART_INKS)}';",
        '',
        '/** One picture per subject and grid (32, 16 or 8 art pixels to the square, which ends its name): rows of letters from CHART_CODES; a full stop is see-through. */',
        'export const CHART_ART: Readonly<Record<string, readonly string[]>> = {',
    ]
    for name, rows in figures.items():
        lines.append(f'  {name}: [')
        lines += [f"    '{row}'," for row in rows]
        lines.append('  ],')
    lines += ['};', '']
    (ROOT / 'src/ui/chart-art.ts').write_text('\n'.join(lines))
    print(f'src/ui/chart-art.ts: {len(figures)} pictures, {len(CHART_INKS)} colours')


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
    chart()
    if sys.argv[1:] == ['chart']:
        return
    colours, figures = bake('art/units', 30, 32)
    write('src/ui/unit-art.ts', 'Unit figures for the map', 'UNIT', 'FIGURE_SIZE', 30, colours, figures,
          'One figure per unit type: rows of letters from UNIT_CODES; a full stop is see-through.')
    colours, figures = bake('art/places', 32, 24, owner_key=True)
    write('src/ui/place-art.ts', 'Colonies and native settlements for the map', 'PLACE', 'PLACE_SIZE', 32, colours, figures,
          "One picture per look of a place: rows of letters from PLACE_CODES; '*' is the owner's colour and a full stop is see-through.")
    colours, figures = bake('art/features', 32, 5, prepare=stand, shared=False)
    write('src/ui/feature-art.ts', 'Forests, hills and mountains for the map', 'FEATURE', 'FEATURE_SIZE', 32, colours, figures,
          'One picture per terrain that has something standing on its ground: rows of letters from FEATURE_CODES; a full stop is see-through.')
    colours, figures = bake('art/floors', 32, 3, prepare=floor, shared=False)
    colours = level(colours, figures)
    write('src/ui/floor-art.ts', 'Ground textures for the map', 'FLOOR', 'FLOOR_SIZE', 32, colours, figures,
          'One texture per open terrain, filling the square: rows of letters from FLOOR_CODES.')


main()
