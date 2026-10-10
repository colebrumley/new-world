"""Draw the source pictures for the explorer's chart: what the unexplored map is made of (R-1011).

    uv run --with pillow scripts/draw-chart.py && uv run --with pillow --with numpy scripts/bake-art.py chart

Writes art/chart/*.png: the vellum floor, the compass rose, the sea serpent and the ship, each at
the three grids the map is drawn on (32, 16 and 8 art pixels to the square; the number ends the
file's name). Everything is drawn here from lines and shapes, so the pictures are our own
(constraint C1), and only in the six chart inks of the map palette, so that baking them needs no
shrinking and no new colours. bake-art.py then writes them out as data, src/ui/chart-art.ts.
"""
import math
import random
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'art' / 'chart'
# The chart inks: entries of PALETTE in src/ui/pixel-art.ts.
PARCHMENT, SAND, HILL, EARTH, WOOD, INK = '#e9dfc4', '#d3bd7a', '#a39262', '#7c6b45', '#6b4a2a', '#111111'
GRIDS = (32, 16, 8)


def canvas(side: int) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    picture = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    draw = ImageDraw.Draw(picture)
    draw.fontmode = '1'  # no in-between shades anywhere
    return picture, draw


def vellum(grid: int) -> Image.Image:
    """Aged vellum: parchment with a few fibres and flecks of the darker inks. It fills its square."""
    picture, draw = canvas(grid)
    draw.rectangle((0, 0, grid, grid), fill=PARCHMENT)
    if grid < 16:
        return picture
    rnd = random.Random(1011 + grid)
    unit = grid // 16
    for _ in range(2 * unit * unit + 1):  # fibres: a few short runs lying mostly across
        x, y, run = rnd.randrange(grid), rnd.randrange(grid), rnd.randint(1, 2 * unit)
        rise = rnd.choice((0, 0, 0, 1, -1))
        for i in range(run):
            px, py = x + i, y + (rise if i >= run // 2 else 0)
            if 0 <= px < grid and 0 <= py < grid:
                picture.putpixel((px, py), _rgba(SAND))
    for _ in range(unit):  # the odd fleck
        picture.putpixel((rnd.randrange(grid), rnd.randrange(grid)), _rgba(HILL))
    return picture


def _rgba(colour: str) -> tuple[int, int, int, int]:
    return (int(colour[1:3], 16), int(colour[3:5], 16), int(colour[5:7], 16), 255)


def rose(grid: int) -> Image.Image:
    """A compass rose four squares across: two rings, sixteen ticks, eight points halved dark and light, north marked."""
    side = 4 * grid
    picture, draw = canvas(side)
    c = (side - 1) / 2
    polar = lambda r, turn: (c + r * math.sin(turn * math.tau), c - r * math.cos(turn * math.tau))
    outer, inner = side * 0.40, side * 0.33
    ring = lambda r, colour: draw.ellipse((c - r, c - r, c + r, c + r), outline=colour)
    ring(outer, WOOD)
    if grid >= 16:
        ring(inner, EARTH)
        for i in range(32):  # ticks between the rings, longer on the sixteen winds
            reach = inner if i % 2 == 0 else (outer + inner) / 2
            draw.line((polar(outer, i / 32), polar(reach, i / 32)), fill=EARTH)
    else:
        for i in range(16):
            draw.point(polar(outer - 1, i / 16), fill=EARTH)

    def point(turn: float, length: float, waist: float) -> None:
        tip, left, right = polar(length, turn), polar(waist, turn - 1 / 8), polar(waist, turn + 1 / 8)
        edge = INK if grid >= 16 else EARTH  # at the smallest grid an ink edge would swallow the point
        draw.polygon((tip, left, (c, c)), fill=SAND, outline=edge)
        draw.polygon((tip, right, (c, c)), fill=WOOD, outline=edge)

    for i in range(4):  # the half winds behind, then the four quarters
        point((i + 0.5) / 4, side * 0.30, side * 0.07)
    for i in range(4):
        point(i / 4, side * 0.47, side * 0.09)
    r = max(1, grid // 12)
    draw.ellipse((c - r, c - r, c + r, c + r), fill=PARCHMENT, outline=INK)
    # north: a lily head at the tip of the upper point
    if grid >= 16:
        top = c - side * 0.47
        w = grid // 8
        draw.polygon(((c, top - w), (c - w, top + w), (c + w, top + w)), fill=INK)
        draw.line(((c - 2 * w, top + 2 * w), (c + 2 * w, top + 2 * w)), fill=INK)
    return picture


def waves(draw: ImageDraw.ImageDraw, spots: list[tuple[float, float]], grid: int, colour: str = HILL) -> None:
    """Little wave marks: a crest with its two ends turned down."""
    w = max(1, grid // 8)
    for x, y in spots:
        draw.line(((x - w, y), (x + w, y)), fill=colour)
        draw.point((x - w - 1, y + 1), fill=colour)
        draw.point((x + w + 1, y + 1), fill=colour)


def serpent(grid: int) -> Image.Image:
    """A sea serpent three squares across: head and neck risen at the left, two coils and a tail breaking the water."""
    side = 3 * grid
    picture, draw = canvas(side)
    water = side * 0.72
    thick = max(2, round(grid * 0.19))

    def stroke(path: list[tuple[float, float]], width: int) -> None:
        for colour, extra in ((INK, 2), (EARTH, 0)):
            for (x0, y0), (x1, y1) in zip(path, path[1:]):
                draw.line(((x0, y0), (x1, y1)), fill=colour, width=width + extra)
            for x, y in path:
                r = (width + extra) / 2
                draw.ellipse((x - r, y - r, x + r, y + r), fill=colour)

    def arch(cx: float, radius: float, width: int) -> None:
        stroke([(cx + radius * math.cos(a), water - radius * 1.25 * math.sin(a)) for a in [math.pi * i / 24 for i in range(25)]], width)

    # tail, coils, then the neck and head in front
    tail = [(side * 0.86, water), (side * 0.89, water - side * 0.10), (side * 0.94, water - side * 0.16)]
    stroke(tail, max(1, thick - 2))
    if grid >= 16:
        tx, ty = tail[-1]
        draw.polygon(((tx, ty), (tx + side * 0.05, ty - side * 0.06), (tx - side * 0.03, ty - side * 0.07)), fill=EARTH, outline=INK)
    arch(side * 0.70, side * 0.085, max(1, thick - 1))
    arch(side * 0.47, side * 0.115, thick)
    neck = [(side * 0.27, water), (side * 0.25, water - side * 0.16), (side * 0.20, water - side * 0.30), (side * 0.17, water - side * 0.40)]
    stroke(neck, thick)
    hx, hy = side * 0.15, water - side * 0.45
    rx, ry = side * 0.085, side * 0.055
    draw.ellipse((hx - rx, hy - ry, hx + rx, hy + ry), fill=EARTH, outline=INK)
    if grid >= 16:
        draw.line(((hx - rx, hy + ry * 0.3), (hx - rx * 0.1, hy + ry * 0.3)), fill=INK)  # the mouth
        draw.point((hx - rx * 0.2, hy - ry * 0.4), fill=PARCHMENT)  # the eye
        for i in range(3):  # a crest down the back of the neck
            x, y = neck[i + 1]
            draw.polygon(((x + thick / 2, y), (x + thick / 2 + grid // 8 + 1, y - grid // 16), (x + thick / 2, y + grid // 8)), fill=WOOD)
        for cx, radius in ((side * 0.47, side * 0.115), (side * 0.70, side * 0.085)):  # scales along the coils
            for a in (0.3, 0.5, 0.7):
                draw.point((cx + radius * math.cos(a * math.pi), water - radius * 1.25 * math.sin(a * math.pi)), fill=SAND)
    # the water closes over what goes under it
    draw.rectangle((0, water + 1, side, side), fill=(0, 0, 0, 0))
    spots = [(side * f, water + 1 + (i % 2) * max(1, grid // 8)) for i, f in enumerate((0.10, 0.27, 0.36, 0.47, 0.58, 0.70, 0.80, 0.90))]
    waves(draw, spots, grid, WOOD)
    if grid >= 16:
        waves(draw, [(side * 0.20, water + grid * 0.45), (side * 0.52, water + grid * 0.5), (side * 0.80, water + grid * 0.42)], grid)
    return picture


def ship(grid: int) -> Image.Image:
    """A ship in the margin, two squares across: a round hull, two masts of square sails, a pennant, the sea under her."""
    side = 2 * grid
    picture, draw = canvas(side)
    u = side / 32
    deck, keel = round(20 * u), round(25 * u)
    hull = [(3 * u, deck - 3 * u), (8 * u, deck), (24 * u, deck), (29 * u, deck - 4 * u), (26 * u, keel), (7 * u, keel)]
    hull = [(round(x), round(y)) for x, y in hull]
    draw.polygon(hull, fill=WOOD, outline=INK)
    if grid >= 16:
        draw.line(((round(7 * u), deck + round(2 * u)), (round(26 * u), deck + round(2 * u))), fill=EARTH)
    for mast, top, wide in ((12 * u, 4 * u, 5 * u), (21 * u, 7 * u, 4 * u)):
        mast = round(mast)
        draw.line(((mast, round(top)), (mast, deck)), fill=INK)
        sail = (mast - round(wide), round(top + 2 * u), mast + round(wide), deck - round(3 * u))
        draw.rectangle(sail, fill=PARCHMENT, outline=INK)
        if grid >= 16:
            draw.line(((sail[0] + 1, sail[3] - 1), (sail[2] - 1, sail[3] - 1)), fill=SAND)
            draw.line(((sail[2] - 1, sail[1] + 1), (sail[2] - 1, sail[3] - 1)), fill=SAND)
        draw.line(((mast, round(top)), (mast + round(3 * u), round(top))), fill=WOOD if grid < 16 else EARTH)
        if grid >= 16:
            draw.line(((mast, round(top) + 1), (mast + round(2 * u), round(top) + 1)), fill=EARTH)
    spots = [(side * f, keel + 2 + (i % 2) * max(1, grid // 8)) for i, f in enumerate((0.12, 0.38, 0.64, 0.88))]
    waves(draw, spots, grid, WOOD if grid < 16 else HILL)
    return picture


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, make in (('vellum', vellum), ('rose', rose), ('serpent', serpent), ('ship', ship)):
        for grid in GRIDS:
            make(grid).save(OUT / f'{name}{grid}.png')
    print(f'{OUT.relative_to(ROOT)}: {4 * len(GRIDS)} pictures')


main()
