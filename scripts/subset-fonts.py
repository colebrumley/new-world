#!/usr/bin/env python3
"""Make the page's typeface files (R-1010): basic-Latin subsets of the three faces, as woff2.

The faces are IM FELL English Roman, Italic and SC by Igino Marini, under the SIL Open Font
License 1.1 (src/ui/fonts/OFL.txt). A subset is a Modified Version in the licence's terms, and the
licence reserves the original names, so each subset is renamed: "Chartroom" (roman and italic)
and "Chartroom Caps" (small capitals). The copyright and licence records in the files are kept.

Needs fonttools and brotli (pip install fonttools brotli); neither is needed to build the game.

    python3 scripts/subset-fonts.py roman.ttf italic.ttf sc.ttf

The inputs are the upstream files (ttf, otf, woff or woff2), in that order.
"""
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

OUT = Path(__file__).resolve().parent.parent / 'src' / 'ui' / 'fonts'
# printable ASCII, the no-break space, and the punctuation the game's text uses
UNICODES = [*range(0x20, 0x7F), 0xA0, 0xB7, 0xD7, 0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2026, 0x2212]
FACES = [
    ('chartroom-roman.woff2', 'Chartroom', 'Regular'),
    ('chartroom-italic.woff2', 'Chartroom', 'Italic'),
    ('chartroom-caps.woff2', 'Chartroom Caps', 'Regular'),
]


def main(paths: list[str]) -> None:
    if len(paths) != len(FACES):
        sys.exit(__doc__)
    for path, (file, family, style) in zip(paths, FACES):
        options = subset.Options()
        options.layout_features = ['kern', 'liga']
        options.hinting = False
        options.name_IDs = ['*']
        options.flavor = 'woff2'
        font = TTFont(path)
        subsetter = subset.Subsetter(options)
        subsetter.populate(unicodes=UNICODES)
        subsetter.subset(font)
        full = family if style == 'Regular' else f'{family} {style}'
        names = {1: family, 2: style, 3: f'{full}; subset for New World', 4: full, 6: full.replace(' ', '-'), 16: family, 17: style}
        for record in list(font['name'].names):
            if record.nameID in names:
                font['name'].setName(names[record.nameID], record.nameID, record.platformID, record.platEncID, record.langID)
        font.flavor = 'woff2'
        font.save(OUT / file)
        print(f'{file}: {(OUT / file).stat().st_size} bytes, {len(font.getBestCmap())} characters')


if __name__ == '__main__':
    main(sys.argv[1:])
