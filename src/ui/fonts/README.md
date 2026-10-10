# The page's typeface

`chartroom-roman.woff2`, `chartroom-italic.woff2` and `chartroom-caps.woff2` are basic-Latin
subsets of IM FELL English Roman, Italic and SC by Igino Marini, used under the SIL Open Font
License 1.1 ([OFL.txt](OFL.txt)). A subset is a modified version, and the licence reserves the
original names for the unmodified fonts, so the subsets carry names of their own: "Chartroom" and
"Chartroom Caps". The copyright and licence records inside the files are the originals'.

They are made by `scripts/subset-fonts.py` from the upstream files: printable ASCII, the no-break
space and the few marks the game's text uses, kerning and ligatures kept, hinting dropped. The
stylesheet loads them with `font-display: swap` and falls back to Georgia; nothing is fetched
from another site.
