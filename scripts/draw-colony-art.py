"""Draw the source pictures for the colony screen (R-1013): art/buildings and art/goods.

    PIXELFORGE=pixelforge pixelforge/.venv/bin/python scripts/draw-colony-art.py

Every picture is made here from plain shapes, so the sources are our own (constraint C1) and can be
changed by changing this file. A building is laid out on a 32 x 32 grid and a goods icon on a 16 x 16
one, each drawn large on a flat magenta ground with a dark outline, in the manner of the pictures in
art/places; roofs, flags and awnings are cyan, which scripts/bake-art.py turns into the owner's colour.
Run this, then scripts/bake-art.py, which shrinks the pictures and writes src/ui/building-art.ts and
goods-art.ts. Only Pillow is needed; the Python of a pixelforge checkout has it.
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SIDE = 640
MAGENTA = '#ff00ff'
OUT, CREAM, ROOF, WOOD, DARK = '#3e1a00', '#fdf0c4', '#00ffff', '#9a5c1c', '#6b3d10'
STONE, SHADE, BRICK, HOLE, GOLD = '#cfccbe', '#96938a', '#b9553a', '#431600', '#f6cf2a'
WATER, GREEN, RED, WHITE, IRON = '#2b5fae', '#3d921c', '#c8322b', '#ffffff', '#55555e'
FIRE, BLUE, TAN, OLIVE, GLASS = '#f08a1c', '#3b62c4', '#d19a55', '#8a8f2c', '#2d5a3a'


class Pic:
    """A picture on a grid of `grid` art pixels, drawn `SIDE` pixels square. Lengths are in art pixels."""

    def __init__(self, grid: int = 32, line: float = 1.0):
        self.k = SIDE / grid
        self.w = line
        self.im = Image.new('RGB', (SIDE, SIDE), MAGENTA)
        self.d = ImageDraw.Draw(self.im)

    def _pts(self, pts):
        return [(x * self.k, y * self.k) for x, y in pts]

    def line(self, pts, colour=OUT, width=None):
        width = (self.w if width is None else width) * self.k
        pts = self._pts(pts)
        self.d.line(pts, fill=colour, width=round(width), joint='curve')
        r = width / 2
        for x, y in pts:
            self.d.ellipse((x - r, y - r, x + r, y + r), fill=colour)

    def poly(self, pts, fill, edge=True):
        self.d.polygon(self._pts(pts), fill=fill)
        if edge:
            self.line(list(pts) + [pts[0]])

    def rect(self, x, y, w, h, fill, edge=True):
        self.poly([(x, y), (x + w, y), (x + w, y + h), (x, y + h)], fill, edge)

    def oval(self, x, y, w, h, fill, edge=True):
        k = self.k
        if edge:
            r = self.w / 2
            self.d.ellipse(((x - r) * k, (y - r) * k, (x + w + r) * k, (y + h + r) * k), fill=OUT)
            self.d.ellipse(((x + r) * k, (y + r) * k, (x + w - r) * k, (y + h - r) * k), fill=fill)
        else:
            self.d.ellipse((x * k, y * k, (x + w) * k, (y + h) * k), fill=fill)

    def arch(self, x, y, w, h, fill=HOLE):
        """A round-headed opening standing on y + h."""
        k = self.k
        self.d.rectangle((x * k, (y + w / 2) * k, (x + w) * k, (y + h) * k), fill=fill)
        self.d.ellipse((x * k, y * k, (x + w) * k, (y + w) * k), fill=fill)

    def save(self, folder: str, name: str):
        out = ROOT / 'art' / folder
        out.mkdir(parents=True, exist_ok=True)
        self.im.save(out / f'{name}.png', optimize=True)


# --- parts of a building -------------------------------------------------------------------------

def gable(p, x, w, top, eave, base, wall=CREAM, roof=ROOF, over=1.5):
    """A house seen end on: a wall from eave to base under a pitched roof whose ridge is at top."""
    p.poly([(x, eave), (x + w / 2, top + 1.5), (x + w, eave), (x + w, base), (x, base)], wall)
    p.poly([(x - over, eave + 1), (x + w / 2, top), (x + w + over, eave + 1), (x + w + over - 2.2, eave + 1), (x + w / 2, top + 3.2), (x - over + 2.2, eave + 1)], roof)


def hall(p, x, w, top, eave, base, wall=CREAM, roof=ROOF, slope=3.0, over=1.0):
    """A building seen from the side: a long wall under a roof that slopes back to its ridge."""
    p.rect(x, eave, w, base - eave, wall)
    p.poly([(x - over, eave), (x + slope, top), (x + w - slope, top), (x + w + over, eave)], roof)


def flat(p, x, w, top, base, wall=STONE, cap=SHADE):
    """A flat-topped block with a coping."""
    p.rect(x, top, w, base - top, wall)
    p.rect(x - 0.7, top, w + 1.4, 1.6, cap)


def door(p, cx, base, w=3.0, h=5.0, fill=HOLE):
    p.arch(cx - w / 2, base - h, w, h, fill)


def gate(p, cx, base, w=7.0, h=7.0):
    p.rect(cx - w / 2, base - h, w, h, DARK)
    p.line([(cx, base - h), (cx, base)], OUT, 0.6)


def window(p, x, y, w=2.0, h=2.6, fill=HOLE):
    p.rect(x, y, w, h, fill, edge=False)


def windows(p, x0, x1, y, n, w=2.0, h=2.6):
    for i in range(n):
        window(p, x0 + (x1 - x0 - w) * (i / max(1, n - 1)) if n > 1 else (x0 + x1 - w) / 2, y, w, h)


def chimney(p, x, top, base, w=3.0, fill=BRICK, smoke=False):
    p.rect(x, top, w, base - top, fill)
    p.rect(x - 0.6, top, w + 1.2, 1.4, fill)
    if smoke:
        p.oval(x + 0.2, top - 4.2, 3.4, 3.2, STONE)
        p.oval(x + 2.2, top - 7.4, 4.0, 3.6, STONE)


def cross(p, cx, top, h=5.0, colour=OUT, width=1.2):
    p.line([(cx, top), (cx, top + h)], colour, width)
    p.line([(cx - h * 0.3, top + h * 0.3), (cx + h * 0.3, top + h * 0.3)], colour, width)


def flag(p, x, top, base, w=6.0, h=4.0):
    p.line([(x, top), (x, base)], OUT, 1.2)
    p.poly([(x, top), (x + w, top + 0.6), (x + w - 1.2, top + h / 2), (x + w, top + h - 0.4), (x, top + h)], ROOF)


def crenels(p, x, w, top, fill=STONE, tooth=2.0):
    n = max(2, round((w + tooth) / (tooth * 2)))
    gap = (w - n * tooth) / (n - 1)
    for i in range(n):
        p.rect(x + i * (tooth + gap), top - 2, tooth, 2.6, fill)


def tower(p, x, w, top, base, fill=STONE, cap=None):
    """A battlemented tower; with `cap`, a pointed roof of that colour stands on it instead."""
    p.rect(x, top, w, base - top, fill)
    if cap:
        p.poly([(x - 1, top), (x + w / 2, top - w * 0.9), (x + w + 1, top)], cap)
    else:
        crenels(p, x - 0.6, w + 1.2, top, fill)
    window(p, x + w / 2 - 0.6, top + 3, 1.2, 2.6)


def palisade(p, x0, x1, top, base, post=3.0, fill=WOOD):
    n = round((x1 - x0) / post)
    step = (x1 - x0) / n
    for i in range(n):
        x = x0 + i * step
        p.poly([(x, top + 1.8), (x + step / 2, top), (x + step, top + 1.8), (x + step, base), (x, base)], fill)


def columns(p, x0, x1, top, base, n, w=1.6, fill=WHITE):
    for i in range(n):
        p.rect(x0 + (x1 - x0 - w) * i / (n - 1), top, w, base - top, fill)


def pediment(p, x, w, top, base, fill=ROOF):
    p.poly([(x - 1, base), (x + w / 2, top), (x + w + 1, base)], fill)


def dome(p, cx, base, r, fill=ROOF, lantern=True):
    k = p.k
    edge = p.w / 2
    p.d.pieslice(((cx - r - edge) * k, (base - r - edge) * k, (cx + r + edge) * k, (base + r + edge) * k), 180, 360, fill=OUT)
    p.d.pieslice(((cx - r + edge) * k, (base - r + edge) * k, (cx + r - edge) * k, (base + r - edge) * k), 180, 360, fill=fill)
    p.line([(cx - r, base), (cx + r, base)])
    if lantern:
        p.rect(cx - 1.2, base - r - 3, 2.4, 3.4, CREAM)
        p.poly([(cx - 2, base - r - 3), (cx, base - r - 6), (cx + 2, base - r - 3)], fill)


def water(p, y, x0=0.5, x1=31.5, depth=3.0):
    p.rect(x0, y, x1 - x0, depth, WATER)
    for x in range(int(x0) + 3, int(x1) - 2, 6):
        p.line([(x, y + 1.5), (x + 2.5, y + 1.5)], WHITE, 0.6)


def hull(p, x, y, w, h=4.0, fill=WOOD):
    p.poly([(x, y), (x + w, y), (x + w - 2.5, y + h), (x + 2.5, y + h)], fill)


def sawtooth(p, x, w, top, eave, n, roof=ROOF):
    step = w / n
    for i in range(n):
        p.poly([(x + i * step, eave), (x + i * step, top), (x + (i + 1) * step, eave)], roof)


# --- what a trade shows at its door --------------------------------------------------------------

def bolt(p, x, b):
    p.rect(x, b - 5, 7, 5, BLUE)
    p.oval(x + 5, b - 5, 4, 5, WHITE)


def leaf(p, x, b):
    p.poly([(x + 4, b), (x + 0.5, b - 4), (x + 1.5, b - 8), (x + 4, b - 10), (x + 6.5, b - 8), (x + 7.5, b - 4)], OLIVE)
    p.line([(x + 4, b), (x + 4, b - 8)], OUT, 0.6)


def barrel(p, x, b, w=6.0, h=7.0):
    p.poly([(x + 1, b - h), (x + w - 1, b - h), (x + w, b - h / 2), (x + w - 1, b), (x + 1, b), (x, b - h / 2)], WOOD)
    p.line([(x + 0.6, b - h * 0.72), (x + w - 0.6, b - h * 0.72)], OUT, 0.7)
    p.line([(x + 0.6, b - h * 0.28), (x + w - 0.6, b - h * 0.28)], OUT, 0.7)


def pelt(p, x, b):
    p.poly([(x + 2.5, b - 9), (x + 5.5, b - 9), (x + 6, b - 7), (x + 8, b - 7.5), (x + 7, b - 4.5), (x + 6, b - 4), (x + 8, b - 0.5), (x + 5.5, b - 1.5),
            (x + 4, b), (x + 2.5, b - 1.5), (x, b - 0.5), (x + 2, b - 4), (x + 1, b - 4.5), (x, b - 7.5), (x + 2, b - 7)], TAN)


def logs(p, x, b, r=3.2):
    for dx, dy in ((0, 0), (r * 2 - 0.4, 0), (r - 0.2, -r * 1.7)):
        p.oval(x + dx, b - r * 2 + dy, r * 2, r * 2, WOOD)
        p.oval(x + dx + r - 1, b - r - 1 + dy, 2, 2, CREAM, edge=False)


def anvil(p, x, b):
    p.poly([(x, b - 6), (x + 8, b - 6), (x + 8, b - 4.4), (x + 5.5, b - 3.4), (x + 5.5, b - 1.6), (x + 7, b), (x + 1.5, b), (x + 3, b - 1.6), (x + 3, b - 3.4), (x - 1.5, b - 4.6)], IRON)


def board(p, x, y, emblem):
    """A hanging sign with the trade's mark, its foot at y."""
    p.rect(x - 1, y - 10.5, 10, 11.5, CREAM)
    emblem(p, x, y - 0.6)


def cottage(emblem, wall=CREAM):
    """A craftsman's house: a cottage end on, a chimney, and the trade's mark standing at the door."""
    p = Pic()
    chimney(p, 21, 6, 16, 3.4)
    gable(p, 9, 21, 4, 15, 31, wall)
    door(p, 24.5, 31, 4, 8)
    window(p, 13, 18.5, 3.4, 3.6)
    window(p, 18, 9.5, 3, 3)
    emblem(p, 1, 31)
    return p


def shop(emblem, wall=CREAM):
    """A shop: a longer building side on, with an awning over its front and the mark hung out on a board."""
    p = Pic()
    chimney(p, 23, 3, 9, 3.4)
    hall(p, 10, 21, 6, 13, 31, wall)
    p.poly([(11, 18), (30, 18), (31.2, 22), (9.8, 22)], ROOF)
    door(p, 25.5, 31, 4, 7.5)
    window(p, 12.5, 24, 8, 4, HOLE)
    window(p, 14, 14.4, 2.4, 2.4)
    window(p, 20, 14.4, 2.4, 2.4)
    window(p, 26, 14.4, 2.4, 2.4)
    p.line([(4, 12), (4, 31)], OUT, 1.2)
    p.line([(4, 13.5), (9, 13.5)], OUT, 1.0)
    board(p, 0.8, 25.5, emblem)
    return p


def factory(emblem, wall=BRICK, stacks=1):
    """A factory: a long works under a saw-tooth roof with tall smoking stacks, the mark on a board at its gate."""
    p = Pic()
    for i in range(stacks):
        chimney(p, 25 - i * 6, 5, 16, 3.6, SHADE, smoke=True)
    sawtooth(p, 3, 28, 10, 16, 4)
    p.rect(3, 16, 28, 15, wall)
    windows(p, 14, 29.5, 18.5, 4, 2.2, 3.2)
    windows(p, 14, 29.5, 24, 4, 2.2, 3.2)
    gate(p, 8.2, 31, 6.5, 7)
    board(p, 0.6, 22.5, emblem)
    return p


# --- the buildings -------------------------------------------------------------------------------

def stockade():
    p = Pic()
    flag(p, 16, 3, 16, 7, 4.6)
    palisade(p, 1, 31, 13, 31, 3.0)
    gate(p, 16, 31, 8, 9)
    p.line([(1, 21), (11.5, 21)], OUT, 0.8)
    p.line([(20.5, 21), (31, 21)], OUT, 0.8)
    return p


def fort():
    p = Pic()
    flag(p, 16, 1.5, 14, 7, 4.6)
    palisade(p, 7, 25, 14, 31, 3.0)
    for x in (0.8, 22.2):
        p.rect(x, 13, 9, 18, WOOD)
        p.poly([(x - 1.2, 13), (x + 4.5, 6), (x + 10.2, 13)], ROOF)
        window(p, x + 3.3, 16, 2.4, 3)
        p.line([(x, 22), (x + 9, 22)], OUT, 0.7)
    gate(p, 16, 31, 8, 9.5)
    return p


def fortress():
    p = Pic()
    flag(p, 16, 1, 12, 7, 4.6)
    p.rect(6, 15, 20, 16, STONE)
    crenels(p, 8.5, 15, 15)
    tower(p, 0.8, 8.4, 11, 31)
    tower(p, 22.8, 8.4, 11, 31)
    p.rect(11.5, 11, 9, 20, STONE)
    crenels(p, 11, 10, 11)
    door(p, 16, 31, 5.4, 9)
    p.line([(1, 23), (9, 23)], SHADE, 0.7)
    p.line([(23, 23), (31, 23)], SHADE, 0.7)
    return p


def musket_rack(p, x, b):
    p.line([(x, b - 3), (x + 8, b - 3)], OUT, 1.0)
    for i in range(3):
        p.line([(x + 1.2 + i * 2.8, b), (x + 1.2 + i * 2.8, b - 9)], IRON, 1.1)
        p.line([(x + 1.2 + i * 2.8, b), (x + 1.2 + i * 2.8, b - 3.6)], WOOD, 1.5)


def armory():
    p = Pic()
    gable(p, 10, 20, 5, 15, 31, STONE)
    door(p, 20, 31, 5, 9)
    window(p, 18.6, 9.5, 2.8, 2.8)
    p.rect(0.8, 19, 10.4, 12, WOOD)
    musket_rack(p, 2, 31)
    return p


def magazine():
    p = Pic()
    hall(p, 6, 25, 7, 14, 31, STONE, slope=4)
    door(p, 18.5, 31, 6, 9, DARK)
    p.line([(18.5, 22.5), (18.5, 31)], OUT, 0.6)
    window(p, 9, 17, 2.4, 2)
    window(p, 26, 17, 2.4, 2)
    barrel(p, 0.8, 31, 6.4, 8)
    barrel(p, 6.4, 31, 6.4, 8)
    barrel(p, 3.6, 23.6, 6.4, 8)
    return p


def arsenal():
    p = Pic()
    flag(p, 16, 0.8, 9, 6.5, 4.2)
    tower(p, 1, 7, 9, 31)
    tower(p, 24, 7, 9, 31)
    p.rect(7, 12, 18, 19, STONE)
    p.poly([(6, 12), (16, 6), (26, 12)], ROOF)
    windows(p, 9, 23, 14.5, 3, 2.2, 3)
    door(p, 16, 31, 6, 8, DARK)
    # a cannon before the gate
    p.line([(2, 26.5), (10, 24.5)], IRON, 2.6)
    p.oval(3, 26, 5, 5, WOOD)
    p.oval(22, 27.4, 3.6, 3.6, IRON)
    p.oval(25.4, 27.4, 3.6, 3.6, IRON)
    p.oval(23.7, 24.6, 3.6, 3.6, IRON)
    return p


def pier(p, x0, x1, y, base=28.5):
    for x in range(int(x0) + 1, int(x1), 5):
        p.rect(x, y, 1.8, base - y + 1.5, DARK)
    p.rect(x0, y, x1 - x0, 2.4, WOOD)


def docks():
    p = Pic()
    water(p, 27.5, 0.5, 31.5, 4)
    gable(p, 2.5, 12, 9, 15.5, 22, WOOD)
    door(p, 8.5, 22, 3.6, 5)
    pier(p, 0.8, 31.2, 21.6)
    p.line([(27, 21), (27, 15.5)], OUT, 1.4)
    barrel(p, 17, 21.6, 5, 6)
    p.rect(22.5, 17.6, 4, 4, TAN)
    return p


def drydock():
    p = Pic()
    water(p, 27.5, 0.5, 31.5, 4)
    gable(p, 0.8, 10, 8, 14.5, 22, WOOD)
    door(p, 5.8, 22, 3.4, 5)
    pier(p, 0.8, 31.2, 21.6)
    # a hull on the stocks, its ribs still bare
    hull(p, 12.5, 15, 18, 5.5, WOOD)
    for x in (16, 19.5, 23, 26.5):
        p.line([(x, 15), (x, 9.5)], OUT, 1.0)
    p.line([(13, 11.5), (30, 11.5)], OUT, 0.8)
    p.line([(14, 20.5), (12.5, 21.6)], OUT, 1.0)
    p.line([(29, 20.5), (30.5, 21.6)], OUT, 1.0)
    return p


def shipyard():
    p = Pic()
    water(p, 27.5, 0.5, 31.5, 4)
    hall(p, 0.8, 13, 9, 14, 22, WOOD, slope=2.5)
    gate(p, 7.3, 22, 6, 6)
    pier(p, 0.8, 31.2, 21.6)
    # a ship fitting out: masts stepped, a sail bent on
    p.line([(20, 16), (20, 1.5)], OUT, 1.3)
    p.line([(26.5, 16), (26.5, 5)], OUT, 1.2)
    p.poly([(15.5, 4), (24.5, 4), (25.2, 12), (14.8, 12)], WHITE)
    p.poly([(20, 1.5), (24, 2.4), (20, 3.4)], ROOF)
    hull(p, 13, 15.5, 18.5, 6, WOOD)
    p.line([(14.5, 18), (30, 18)], OUT, 0.7)
    return p


def town_hall():
    p = Pic()
    # a cupola with a bell over the door
    p.rect(13, 5.5, 6, 7, CREAM)
    p.poly([(11.8, 5.5), (16, 0.8), (20.2, 5.5)], ROOF)
    p.arch(14.6, 7, 2.8, 4.4)
    hall(p, 2.5, 27, 11, 17, 31, CREAM, slope=4)
    door(p, 16, 31, 5, 8.5)
    windows(p, 5, 12, 20.5, 2, 2.6, 4)
    windows(p, 20, 27, 20.5, 2, 2.6, 4)
    p.rect(11.5, 29.6, 9, 1.4, STONE)
    return p


def schoolhouse():
    p = Pic()
    p.rect(13.4, 4, 5.2, 6, RED)
    p.poly([(12.2, 4), (16, 0.6), (19.8, 4)], ROOF)
    p.oval(14.9, 5.4, 2.2, 2.6, GOLD, edge=False)
    gable(p, 5, 22, 7, 17, 31, RED)
    door(p, 16, 31, 4.6, 8, CREAM)
    window(p, 8, 21, 3, 4, CREAM)
    window(p, 21, 21, 3, 4, CREAM)
    return p


def college():
    p = Pic()
    hall(p, 1, 30, 10, 16, 31, BRICK, slope=3.5)
    gable(p, 10.5, 11, 3.5, 12, 31, BRICK)
    door(p, 16, 31, 4.4, 8, CREAM)
    p.oval(14.4, 8.6, 3.2, 3.2, CREAM, edge=False)
    windows(p, 3, 9.5, 19, 2, 2.4, 3.2, )
    windows(p, 22.5, 29, 19, 2, 2.4, 3.2)
    windows(p, 3, 9.5, 25, 2, 2.4, 3.2)
    windows(p, 22.5, 29, 25, 2, 2.4, 3.2)
    for x in (3, 7.1, 22.5, 26.6):
        for y in (19, 25):
            window(p, x, y, 2.4, 3.2, CREAM)
    return p


def university():
    p = Pic()
    dome(p, 16, 11, 6.5)
    p.rect(8.5, 11, 15, 4, CREAM)
    hall(p, 0.8, 30.4, 14, 17.5, 31, CREAM, slope=2)
    pediment(p, 9, 14, 12.5, 18.5)
    p.rect(9, 18.5, 14, 12.5, CREAM)
    columns(p, 9.4, 22.6, 19.4, 31, 4, 1.8)
    for x in (2.4, 5.6, 24.2, 27.4):
        for y in (20, 25.4):
            window(p, x, y, 1.9, 3.2)
    return p


def crate(p, x, b, s=6.0, fill=TAN):
    p.rect(x, b - s, s, s, fill)
    p.line([(x, b - s), (x + s, b)], OUT, 0.6)


def warehouse():
    p = Pic()
    gable(p, 5, 25, 5, 15, 31, WOOD, over=1.2)
    gate(p, 17.5, 31, 10, 10)
    p.rect(15, 8.6, 5, 4, HOLE, edge=False)
    crate(p, 0.8, 31, 7)
    crate(p, 2.4, 24, 5.4)
    return p


def warehouse_expansion():
    p = Pic()
    gable(p, 13, 18, 3, 12, 31, WOOD, over=1.0)
    gable(p, 1, 17, 8, 16, 31, WOOD, over=1.0)
    gate(p, 9.5, 31, 8, 9)
    gate(p, 24.5, 31, 7, 9)
    p.rect(20, 6.4, 4, 3.4, HOLE, edge=False)
    p.rect(7.6, 11.6, 4, 3, HOLE, edge=False)
    barrel(p, 17, 31, 5, 6.4)
    return p


def stable():
    p = Pic()
    hall(p, 1, 30, 8, 15, 31, WOOD, slope=5)
    for x in (4, 13, 22):
        p.rect(x, 20, 6.4, 11, DARK)
        p.rect(x, 20, 6.4, 5, HOLE, edge=False)
        p.line([(x, 25), (x + 6.4, 25)], OUT, 0.7)
    # a horse looks out over the middle half-door
    p.poly([(14.4, 25), (14.8, 20.6), (16.6, 18.6), (17.4, 16.8), (18.2, 18.8), (19, 22.4), (17.6, 23.2), (16.6, 21.8), (16.8, 25)], TAN)
    p.rect(14.6, 10.4, 2.8, 2.8, HOLE, edge=False)
    return p


def custom_house():
    p = Pic()
    flag(p, 16, 0.6, 9, 6.5, 4.2)
    p.rect(2.5, 13, 27, 18, STONE)
    pediment(p, 2.5, 27, 7, 13)
    p.rect(1.5, 13, 29, 2, WHITE)
    columns(p, 4, 28, 15, 29, 5, 2.0)
    door(p, 16, 29, 3.6, 8)
    p.rect(1, 29, 30, 2, SHADE)
    p.oval(14.2, 8.8, 3.6, 3.2, GOLD)
    return p


def sheet(p, x, b):
    p.rect(x + 1, b - 9, 6.6, 9, WHITE)
    for y in (2.4, 4.4, 6.4):
        p.line([(x + 2.4, b - y), (x + 6.2, b - y)], OUT, 0.6)


def press(p, x, b):
    """A hand press: two posts, a screw and a platen."""
    p.rect(x, b - 10, 1.6, 10, WOOD)
    p.rect(x + 7, b - 10, 1.6, 10, WOOD)
    p.rect(x - 0.6, b - 11, 9.8, 1.8, WOOD)
    p.line([(x + 4.3, b - 9), (x + 4.3, b - 5.4)], IRON, 1.4)
    p.rect(x + 1.6, b - 5.6, 5.4, 1.6, IRON)
    p.rect(x + 0.8, b - 3.2, 7, 1.6, WOOD)


def printing_press():
    p = Pic()
    chimney(p, 23, 6, 14, 3.2)
    gable(p, 11, 20, 4, 15, 31)
    door(p, 26, 31, 3.6, 7.6)
    window(p, 14, 19, 6, 5)
    window(p, 19.4, 9.4, 3, 3)
    press(p, 1.2, 31)
    return p


def newspaper():
    p = Pic()
    chimney(p, 25, 2, 9, 3.2)
    hall(p, 8, 23, 5, 11, 31, BRICK)
    p.rect(9.4, 13, 20.2, 3.6, WHITE)
    for x in (11.4, 15, 18.6, 22.2, 25.8):
        p.line([(x, 14.8), (x + 1.8, 14.8)], OUT, 0.9)
    door(p, 26, 31, 3.8, 8, CREAM)
    window(p, 11, 19.5, 4.4, 4, CREAM)
    window(p, 17.6, 19.5, 4.4, 4, CREAM)
    window(p, 11, 26, 4.4, 3.4, CREAM)
    window(p, 17.6, 26, 4.4, 3.4, CREAM)
    for dy in (0, 2.2, 4.4):
        p.rect(0.8, 28.6 - dy, 6.4, 2.4, WHITE)
    return p


def trading_post():
    """A log post with furs stretched to dry on a frame at its side."""
    p = Pic()
    chimney(p, 23, 5, 12, 3.4, SHADE)
    hall(p, 10, 21, 7, 14, 31, WOOD)
    for y in (18, 22, 26):
        p.line([(10, y), (31, y)], OUT, 0.6)
    door(p, 25.5, 31, 4, 8)
    window(p, 13, 19, 6, 4.6)
    p.line([(0.8, 15), (0.8, 31)], OUT, 1.2)
    p.line([(9, 15), (9, 31)], OUT, 1.2)
    p.line([(0.8, 16), (9, 16)], OUT, 1.2)
    pelt(p, 1, 28)
    return p


def lumber_mill():
    p = Pic()
    water(p, 28.5, 0.5, 18, 3)
    hall(p, 9, 22, 5, 12, 31, WOOD, slope=3)
    gate(p, 24, 31, 8, 8)
    window(p, 17, 15, 3, 3)
    # the wheel in the race
    cx, cy, r = 8, 21.5, 7.4
    p.oval(cx - r, cy - r, r * 2, r * 2, DARK)
    p.oval(cx - r + 2, cy - r + 2, r * 2 - 4, r * 2 - 4, CREAM)
    for i in range(4):
        a = i * math.pi / 4
        p.line([(cx - math.cos(a) * r, cy - math.sin(a) * r), (cx + math.cos(a) * r, cy + math.sin(a) * r)], OUT, 0.9)
    p.oval(cx - 1.4, cy - 1.4, 2.8, 2.8, IRON)
    return p


def church():
    p = Pic()
    cross(p, 9, 0.6, 5)
    p.poly([(4.6, 13), (9, 4), (13.4, 13)], ROOF)
    p.rect(5.4, 13, 7.2, 18, CREAM)
    p.arch(7.6, 15.5, 2.8, 4.6)
    hall(p, 12.6, 18, 12, 18, 31, CREAM, slope=2.6, over=0.8)
    door(p, 9, 31, 3.6, 7)
    for x in (15.4, 20.4, 25.4):
        p.arch(x, 21, 2.6, 6)
    return p


def cathedral():
    p = Pic()
    for x in (2, 21):
        cross(p, x + 4.5, 0.4, 4.4)
        p.poly([(x - 0.4, 12), (x + 4.5, 3.4), (x + 9.4, 12)], ROOF)
        p.rect(x, 12, 9, 19, STONE)
        p.arch(x + 3.2, 14.5, 2.6, 5)
        p.arch(x + 3.2, 22.5, 2.6, 5)
    p.rect(11, 14, 10, 17, STONE)
    p.poly([(10, 14), (16, 7.6), (22, 14)], ROOF)
    p.oval(13.2, 15.2, 5.6, 5.6, BLUE)
    p.line([(16, 15.2), (16, 20.8)], OUT, 0.6)
    p.line([(13.2, 18), (18.8, 18)], OUT, 0.6)
    door(p, 16, 31, 5, 8.4)
    return p


def iron_works():
    p = Pic()
    chimney(p, 23, 4, 15, 4, SHADE, smoke=True)
    chimney(p, 15.5, 8, 15, 3.4, SHADE)
    # the furnace: a stone stack with fire at its mouth
    p.poly([(0.8, 31), (2.6, 12), (10.4, 12), (12.2, 31)], STONE)
    p.rect(2, 10, 9, 2.4, SHADE)
    p.arch(4, 22, 5, 9, FIRE)
    p.arch(5.3, 25, 2.4, 6, GOLD)
    sawtooth(p, 12, 19, 11, 16, 3)
    p.rect(12, 16, 19, 15, BRICK)
    gate(p, 17, 31, 6, 7)
    windows(p, 14, 29.5, 18.4, 4, 2.2, 3)
    window(p, 22.6, 25, 2.2, 3.4)
    window(p, 27.2, 25, 2.2, 3.4)
    return p


def capitol():
    p = Pic()
    flag(p, 16, 0.4, 5, 5, 3.4)
    dome(p, 16, 13, 7.5, lantern=False)
    p.rect(9.5, 13, 13, 3.6, WHITE)
    for x in (11, 13.6, 16.2, 18.8):
        window(p, x, 13.8, 1.2, 2.2)
    p.rect(2, 16.5, 28, 14.5, CREAM)
    pediment(p, 8.5, 15, 14, 19.5)
    columns(p, 8.8, 23.2, 19.6, 29.4, 5, 1.7)
    p.rect(1, 29.4, 30, 1.6, STONE)
    for x in (3.4, 26):
        window(p, x, 20, 2.4, 3)
        window(p, x, 24.6, 2.4, 3)
    return p


def capitol_expansion():
    p = Pic()
    flag(p, 16, 0.2, 5, 5, 3.2)
    dome(p, 16, 12, 6.4, lantern=False)
    p.rect(10.5, 12, 11, 3, WHITE)
    for cx in (4.4, 27.6):
        dome(p, cx, 16.5, 3.2, lantern=False)
    p.rect(0.8, 16.5, 30.4, 14.5, CREAM)
    pediment(p, 9.5, 13, 13.4, 18.4)
    columns(p, 9.8, 22.2, 18.6, 29.4, 5, 1.5)
    columns(p, 1.6, 7.6, 19, 29.4, 3, 1.4)
    columns(p, 24.4, 30.4, 19, 29.4, 3, 1.4)
    p.rect(0.5, 29.4, 31, 1.6, STONE)
    return p


BUILDINGS = {
    'stockade': stockade, 'fort': fort, 'fortress': fortress, 'armory': armory, 'magazine': magazine, 'arsenal': arsenal,
    'docks': docks, 'drydock': drydock, 'shipyard': shipyard, 'townHall': town_hall,
    'schoolhouse': schoolhouse, 'college': college, 'university': university,
    'warehouse': warehouse, 'warehouseExpansion': warehouse_expansion, 'stable': stable, 'customHouse': custom_house,
    'printingPress': printing_press, 'newspaper': newspaper,
    'weaversHouse': lambda: cottage(bolt), 'weaversShop': lambda: shop(bolt), 'textileMill': lambda: factory(bolt),
    'tobacconistsHouse': lambda: cottage(leaf), 'tobacconistsShop': lambda: shop(leaf), 'cigarFactory': lambda: factory(leaf),
    'rumDistillersHouse': lambda: cottage(lambda p, x, b: barrel(p, x + 1, b, 7, 8.5)), 'rumDistillery': lambda: shop(lambda p, x, b: barrel(p, x + 1, b, 6.4, 8)),
    'rumFactory': lambda: factory(lambda p, x, b: barrel(p, x + 1, b, 6.4, 8), stacks=2),
    'capitol': capitol, 'capitolExpansion': capitol_expansion,
    'furTradersHouse': lambda: cottage(pelt, WOOD), 'furTradingPost': trading_post, 'furFactory': lambda: factory(pelt),
    'carpentersShop': lambda: cottage(lambda p, x, b: logs(p, x - 0.4, b, 2.4), WOOD), 'lumberMill': lumber_mill,
    'church': church, 'cathedral': cathedral,
    'blacksmithsHouse': lambda: cottage(lambda p, x, b: anvil(p, x + 0.6, b), STONE), 'blacksmithsShop': lambda: shop(lambda p, x, b: anvil(p, x + 0.4, b - 1), STONE),
    'ironWorks': iron_works,
}


# --- goods, on a 16 x 16 grid ----------------------------------------------------------------------

def icon():
    return Pic(16, 1.0)


def g_food():
    p = icon()
    # a sheaf of wheat, bound
    for dx, top in ((-4.5, 3.5), (-2.2, 1.6), (0, 0.8), (2.2, 1.6), (4.5, 3.5)):
        p.line([(8 + dx * 0.25, 15), (8 + dx, top + 4)], WOOD, 1.0)
        p.oval(8 + dx - 1.5, top, 3, 5.6, GOLD)
    p.poly([(4.6, 15.2), (6.2, 9.4), (9.8, 9.4), (11.4, 15.2)], GOLD)
    p.rect(5.6, 9.4, 4.8, 1.8, RED)
    return p


def g_sugar():
    p = icon()
    p.poly([(3, 15), (6.6, 2.4), (8, 1.2), (9.4, 2.4), (13, 15)], WHITE)
    p.poly([(2.6, 15.2), (4, 10.4), (12, 10.4), (13.4, 15.2)], BLUE)
    return p


def g_tobacco():
    p = icon()
    p.poly([(8, 15.2), (2.4, 9.6), (3.4, 4.4), (8, 0.8), (12.6, 4.4), (13.6, 9.6)], OLIVE)
    p.line([(8, 15), (8, 3)], OUT, 0.7)
    p.line([(8, 11), (4.6, 8)], OUT, 0.5)
    p.line([(8, 11), (11.4, 8)], OUT, 0.5)
    p.line([(8, 7.4), (5.4, 5)], OUT, 0.5)
    p.line([(8, 7.4), (10.6, 5)], OUT, 0.5)
    return p


def g_cotton():
    p = icon()
    p.line([(8, 15.4), (8, 9)], WOOD, 1.2)
    p.poly([(8, 12.6), (3.4, 10.4), (5.6, 14.2)], GREEN)
    p.poly([(8, 12.6), (12.6, 10.4), (10.4, 14.2)], GREEN)
    p.oval(2, 4.4, 6.6, 6.6, WHITE)
    p.oval(7.4, 4.4, 6.6, 6.6, WHITE)
    p.oval(4.6, 0.8, 6.8, 6.8, WHITE)
    p.oval(5.4, 5.4, 5.2, 4.4, WHITE, edge=False)
    return p


def g_furs():
    p = icon()
    p.poly([(5, 0.8), (11, 0.8), (11.6, 3.6), (15, 2.6), (13.4, 7.4), (11.6, 8), (15, 14.4), (10.6, 13), (8, 15.4), (5.4, 13), (1, 14.4), (4.4, 8), (2.6, 7.4), (1, 2.6), (4.4, 3.6)], TAN)
    p.line([(8, 3.4), (8, 12)], DARK, 0.7)
    return p


def g_lumber():
    p = icon()
    for x, y in ((0.8, 8.6), (8, 8.6), (4.4, 2)):
        p.oval(x, y, 7.2, 7.2, WOOD)
        p.oval(x + 2.2, y + 2.2, 2.8, 2.8, CREAM)
    return p


def g_ore():
    p = icon()
    p.poly([(1, 15), (2.4, 9), (6.6, 6.4), (9.4, 9.4), (9, 15)], SHADE)
    p.poly([(7, 15), (8, 6), (11.6, 3), (14.6, 7.6), (15, 15)], SHADE)
    p.poly([(4.4, 15.2), (5.6, 11), (9.4, 9.6), (12.2, 12), (12.6, 15.2)], STONE)
    for x, y in ((10.6, 6.2), (4.2, 10), (8.4, 12.4)):
        p.rect(x, y, 1.6, 1.6, FIRE, edge=False)
    return p


def g_silver():
    p = icon()
    for x, y in ((0.8, 10), (8, 10), (4.4, 4.6)):
        p.poly([(x + 1.2, y), (x + 6, y), (x + 7.2, y + 5), (x, y + 5)], STONE)
        p.line([(x + 2.2, y + 1.6), (x + 5, y + 1.6)], WHITE, 0.8)
    return p


def g_horses():
    p = icon()
    p.poly([(4.6, 15.2), (5.4, 9.4), (3, 9.8), (1, 8), (4.6, 3.4), (6.4, 0.8), (7.6, 2.6), (11.4, 4), (14.6, 9.6), (14.2, 15.2)], WOOD)
    p.poly([(7.6, 2.6), (11.4, 4), (14.6, 9.6), (14.4, 12.4), (11.6, 8.6), (9.6, 5.6)], DARK)
    p.rect(5.4, 5, 1.3, 1.3, OUT, edge=False)
    return p


def g_rum():
    p = icon()
    p.rect(6.6, 0.8, 2.8, 4.2, WOOD)
    p.poly([(4, 15.2), (4, 8), (6.4, 5), (9.6, 5), (12, 8), (12, 15.2)], GLASS)
    p.rect(5, 9.4, 6, 3.6, CREAM, edge=False)
    return p


def g_cigars():
    p = icon()
    for y in (2, 6.2, 10.4):
        p.poly([(1, y + 1.8), (2.4, y), (13.6, y), (15, y + 1.8), (13.6, y + 3.6), (2.4, y + 3.6)], WOOD)
        p.rect(9.4, y, 2.2, 3.6, GOLD, edge=False)
    p.rect(5, 1.6, 2.2, 13, RED)
    return p


def g_cloth():
    p = icon()
    p.rect(1, 3, 11, 10.4, BLUE)
    p.oval(9.4, 3, 5.6, 10.4, WHITE)
    p.oval(11.2, 6.4, 2, 3.6, BLUE, edge=False)
    p.line([(1, 6.4), (9.6, 6.4)], WHITE, 0.6)
    p.line([(1, 10), (9.6, 10)], WHITE, 0.6)
    return p


def g_coats():
    p = icon()
    p.poly([(5.4, 1), (10.6, 1), (15, 4.4), (13.4, 9.4), (11.6, 8.2), (12.2, 15.2), (3.8, 15.2), (4.4, 8.2), (2.6, 9.4), (1, 4.4)], RED)
    p.poly([(6.2, 1), (8, 4.6), (9.8, 1)], CREAM)
    p.line([(8, 4.6), (8, 15)], OUT, 0.7)
    for y in (7, 10, 13):
        p.rect(8.9, y, 1.1, 1.1, GOLD, edge=False)
    return p


def g_trade_goods():
    p = icon()
    # a string of beads
    p.line([(8 + math.cos(i * math.pi / 8) * 5.2, 8 + math.sin(i * math.pi / 8) * 5.2) for i in range(17)], OUT, 0.8)
    for i in range(6):
        a = i * math.pi / 3 + math.pi / 6
        p.oval(8 + math.cos(a) * 5.2 - 2.4, 8 + math.sin(a) * 5.2 - 2.4, 4.8, 4.8, (RED, GOLD, BLUE)[i % 3])
    return p


def g_tools():
    p = icon()
    # an axe across a spade
    p.line([(3, 14.4), (12, 3)], OUT, 2.4)
    p.line([(3, 14.4), (12, 3)], WOOD, 1.0)
    p.poly([(10, 1), (15, 2.4), (14.4, 7.4), (11.4, 5.6)], STONE)
    p.line([(13, 14.4), (5, 4.4)], OUT, 2.4)
    p.line([(13, 14.4), (5, 4.4)], WOOD, 1.0)
    p.poly([(1.4, 3.4), (4.6, 0.8), (7.6, 4.4), (4.4, 7.4)], SHADE)
    return p


def g_muskets():
    p = icon()
    p.line([(4.4, 11.6), (14.4, 1.6)], OUT, 2.6)
    p.line([(4.4, 11.6), (14.4, 1.6)], STONE, 1.1)
    p.poly([(1, 13), (4.6, 8.6), (7.4, 11.4), (5.4, 12.2), (3, 15.2)], WOOD)
    p.line([(6, 10), (9.4, 6.6)], WOOD, 1.6)
    p.rect(6.6, 10.6, 1.6, 1.6, GOLD, edge=False)
    return p


def g_hammers():
    p = icon()
    p.line([(4, 14.4), (10, 6)], OUT, 2.8)
    p.line([(4, 14.4), (10, 6)], WOOD, 1.3)
    p.poly([(5.6, 3.4), (8.6, 1), (15, 7.6), (12, 10)], STONE)
    return p


def g_crosses():
    p = icon()
    p.poly([(6.4, 1), (9.6, 1), (9.6, 4.6), (13.6, 4.6), (13.6, 7.8), (9.6, 7.8), (9.6, 15.2), (6.4, 15.2), (6.4, 7.8), (2.4, 7.8), (2.4, 4.6), (6.4, 4.6)], GOLD)
    return p


def g_bells():
    p = icon()
    p.oval(6.4, 0.8, 3.2, 3.2, GOLD)
    p.oval(6.6, 11.6, 2.8, 3.6, IRON)
    p.poly([(1.4, 13), (3.6, 10.4), (4.4, 5.4), (6.4, 3), (9.6, 3), (11.6, 5.4), (12.4, 10.4), (14.6, 13)], GOLD)
    p.line([(5.6, 6), (5, 10)], WHITE, 0.8)
    return p


GOODS = {
    'food': g_food, 'sugar': g_sugar, 'tobacco': g_tobacco, 'cotton': g_cotton, 'furs': g_furs, 'lumber': g_lumber, 'ore': g_ore,
    'silver': g_silver, 'horses': g_horses, 'rum': g_rum, 'cigars': g_cigars, 'cloth': g_cloth, 'coats': g_coats,
    'tradeGoods': g_trade_goods, 'tools': g_tools, 'muskets': g_muskets, 'hammers': g_hammers, 'crosses': g_crosses, 'bells': g_bells,
}


def main() -> None:
    for name, draw in BUILDINGS.items():
        draw().save('buildings', name)
    for name, draw in GOODS.items():
        draw().save('goods', name)
    print(f'art/buildings: {len(BUILDINGS)} pictures; art/goods: {len(GOODS)} pictures')


main()
