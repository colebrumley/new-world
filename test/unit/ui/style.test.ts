// The page's theme (R-1010): the stylesheet's tokens, checked as text. Every colour, texture and
// typeface is a custom property on :root, nothing below that block names a colour of its own, the
// textures are procedural, the typeface is our own copy, and the inks can be read on the parchment.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NATION_IDS, NATIONS } from '../../../src/engine/data/nations';
import { INK, PALETTE } from '../../../src/ui/pixel-art';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const file = join(root, 'src', 'ui', 'style.css');
const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The token block: the first `:root { ... }` in the file. */
const start = css.indexOf(':root {');
const end = css.indexOf('\n}', start);
const tokenBlock = css.slice(start, end);
const tokens = new Map<string, string>();
// (a value may hold a data URI, which has semicolons of its own inside its quotes)
for (const match of tokenBlock.matchAll(/(--[a-z-]+):\s*((?:"[^"]*"|[^;"])+);/g)) tokens.set(match[1]!, match[2]!.trim());
const token = (name: string): string => {
  const value = tokens.get(name);
  if (value === undefined) throw new Error(`no token ${name}`);
  return value;
};
const fontFaces = [...css.matchAll(/@font-face\s*\{[^}]*\}/g)].map((m) => m[0]);
/** Everything that is neither the token block nor a font: the rules that must use the tokens. */
const rules = fontFaces.reduce((text, face) => text.replace(face, ''), css.slice(0, start) + css.slice(end));

/** WCAG 2 relative luminance and contrast ratio of two `#rrggbb` colours. */
function luminance(hex: string): number {
  const channel = (i: number): number => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}
function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

describe('the theme tokens', () => {
  it('names parchment, ink, faded ink, wood, brass, wax, the four nations and the Crown as colours on :root', () => {
    for (const name of ['--parchment', '--parchment-light', '--parchment-shade', '--ink', '--ink-faded', '--ink-amber', '--ink-active', '--wood', '--wood-dark', '--wood-light', '--brass', '--brass-light', '--brass-dark', '--wax', '--nation-england', '--nation-france', '--nation-spain', '--nation-netherlands', '--nation-crown']) {
      expect(token(name), name).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('names the textures and the typefaces', () => {
    for (const name of ['--grain-parchment', '--grain-wood', '--sheet', '--table', '--font-body', '--font-display', '--rule', '--focus-ring']) expect(token(name), name).not.toBe('');
    expect(token('--font-body')).toMatch(/^'Chartroom', Georgia,/);
    expect(token('--font-display')).toMatch(/^'Chartroom Caps', Georgia,/);
  });

  it('gives the nations the colours they have on the map, and the Crown its white', () => {
    for (const nation of NATION_IDS) expect(token(`--nation-${nation}`), nation).toBe(NATIONS[nation].color);
    expect(token('--nation-crown')).toBe(PALETTE[INK.white]);
    // an element showing a nation is told which with data-nation
    for (const nation of [...NATION_IDS, 'crown']) expect(rules).toContain(`[data-nation='${nation}'] { --nation: var(--nation-${nation}); }`);
  });

  it('the page and the installed app open on the wood', () => {
    expect(readFileSync(join(root, 'index.html'), 'utf8')).toContain(`<meta name="theme-color" content="${token('--wood')}" />`);
    const manifest = JSON.parse(readFileSync(join(root, 'public', 'manifest.webmanifest'), 'utf8')) as { theme_color: string; background_color: string };
    expect(manifest.theme_color).toBe(token('--wood'));
    expect(manifest.background_color).toBe(token('--wood-dark'));
  });
});

describe('the stylesheet below the tokens', () => {
  // quoted text (the words a rule writes on the page) is not a value
  const values = rules.replace(/'[^'\n]*'|"[^"\n]*"/g, "''");

  it('names no colour of its own: no hex, no colour function, no colour by name', () => {
    expect(values.match(/#[0-9a-f]{3,8}\b/gi) ?? []).toEqual([]);
    expect(values.match(/\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/g) ?? []).toEqual([]);
    const named = /(?<![-\w])(?:black|white|red|green|blue|yellow|orange|purple|gr[ae]y|gold|silver|brown|tan|beige|ivory|navy|maroon|olive|teal|wheat|sienna|peru|khaki|linen|crimson|firebrick)(?![-\w])/g;
    expect(values.match(named) ?? []).toEqual([]);
  });

  it('mixes colours only from tokens', () => {
    for (const mix of values.matchAll(/color-mix\(in srgb, ([^,]+), ([^)]+\)?)\)/g)) {
      expect(mix[1], mix[0]).toMatch(/^var\(--[a-z-]+\)( \d+%)?$/);
      expect(mix[2], mix[0]).toMatch(/^(var\(--[a-z-]+\)|transparent)$/);
    }
  });

  it('loads nothing: no picture, no import, no address', () => {
    expect(values).not.toMatch(/url\(/);
    expect(css).not.toMatch(/@import/);
    expect(css).not.toMatch(/\.(png|jpe?g|gif|webp|avif|bmp)\b|;base64,/i);
    // the one address in the file is the SVG namespace inside the two textures
    expect((css.match(/https?:\/\/[^'")\s]+/g) ?? []).filter((address) => address !== 'http://www.w3.org/2000/svg')).toEqual([]);
  });
});

describe('the pages (R-1015)', () => {
  /** The declarations of every rule whose selector mentions one of the reports, the encyclopedia, the save, options and combat panels. */
  const pages = [...rules.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => /\.(report|pedia|save|options|combat)-/.test(m[1]!)).map((m) => ({ selector: m[1]!.trim(), body: m[2]! }));

  it('are there to be checked', () => {
    expect(pages.length).toBeGreaterThan(60);
  });

  it('nothing that takes the keys has its focus ring taken away', () => {
    // the screen itself is focused only to receive keys; everything else keeps the ring of :focus-visible
    expect(pages.filter((rule) => /outline:\s*(none|0)\b/.test(rule.body)).map((rule) => rule.selector)).toEqual(['.report-screen']);
    expect(rules).toContain(':focus-visible { outline: var(--focus-ring); outline-offset: 1px; }');
    expect(rules).toContain('.report-section tr.zoom:focus-visible { outline: var(--focus-ring); outline-offset: -2px; }');
  });

  it('the stamp of a fight is not animated for those who ask for less motion', () => {
    expect(rules).toContain('@media (prefers-reduced-motion: reduce) { .combat-flash { animation: none; } }');
    expect(rules).toMatch(/\.combat-flash \{[^}]*animation: combat-flash /);
  });

  it('the marks of the checklist are drawn in ink, not by the browser', () => {
    expect(rules).toMatch(/\.options-dialog input\[type='checkbox'\], \.customize input\[type='radio'\] \{\s*appearance: none;/);
    expect(rules).toMatch(/input\[type='checkbox'\]:checked::after \{[^}]*background: var\(--ink\);/);
  });
});

describe('the textures', () => {
  it('are noise made by the browser: an inline SVG with feTurbulence each', () => {
    for (const name of ['--grain-parchment', '--grain-wood']) {
      expect(token(name), name).toMatch(/^url\("data:image\/svg\+xml,%3Csvg /);
      expect(token(name), name).toContain('feTurbulence');
      expect(token(name), name).not.toMatch(/%3Cimage|href/); // no picture inside the picture
    }
    expect(token('--planks')).toMatch(/^repeating-linear-gradient\(/);
  });
});

describe('the typeface', () => {
  it('is three faces of our own copy, swapped in when they arrive', () => {
    expect(fontFaces).toHaveLength(3);
    for (const face of fontFaces) {
      expect(face).toContain('font-display: swap');
      const source = /src: url\('(\.\/fonts\/[a-z-]+\.woff2)'\) format\('woff2'\);/.exec(face)?.[1];
      expect(source, face).toBeDefined();
      // a subset: basic Latin only, so a face stays small
      expect(statSync(join(dirname(file), source!)).size).toBeLessThan(45 * 1024);
    }
  });

  it('keeps its licence beside it', () => {
    const licence = readFileSync(join(dirname(file), 'fonts', 'OFL.txt'), 'utf8');
    expect(licence).toContain('SIL OPEN FONT LICENSE Version 1.1');
    expect(licence).toMatch(/^Copyright \(c\) 2007, Igino Marini/);
    expect(existsSync(join(dirname(file), 'fonts', 'README.md'))).toBe(true);
  });
});

describe('ink on parchment', () => {
  // WCAG AA for text of ordinary size is 4.5 to 1; each ink is held to it on the sheet, the lit sheet and the shaded one
  const sheets = ['--parchment', '--parchment-light', '--parchment-shade'] as const;
  it.each([['body ink', '--ink'], ['faded ink', '--ink-faded'], ['warning amber', '--ink-amber'], ['link and active', '--ink-active'], ['good', '--ink-good'], ['bad', '--ink-bad']] as const)('%s meets AA', (_name, ink) => {
    for (const sheet of sheets) expect(contrast(token(ink), token(sheet)), `${ink} on ${sheet}`).toBeGreaterThanOrEqual(4.5);
  });

  it('the ratios, as recorded', () => {
    const ratios = Object.fromEntries(['--ink', '--ink-faded', '--ink-amber', '--ink-active'].map((ink) => [ink, sheets.map((sheet) => contrast(token(ink), token(sheet)).toFixed(2)).join(' / ')]));
    expect(ratios).toMatchInlineSnapshot(`
      {
        "--ink": "12.01 / 13.74 / 9.83",
        "--ink-active": "7.23 / 8.27 / 5.91",
        "--ink-amber": "6.81 / 7.79 / 5.57",
        "--ink-faded": "6.97 / 7.97 / 5.70",
      }
    `);
  });

  it('light text can be read where it lies on wood, wax and brass plates carry ink', () => {
    expect(contrast(token('--parchment-light'), token('--wood-light'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('--parchment-light'), token('--wax'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('--parchment-light'), token('--ink-good'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('--ink'), token('--brass'))).toBeGreaterThanOrEqual(4.5);
  });
});
