// R-1023: the link and image checker for the player manual in wiki/ (published to the GitHub wiki by
// .github/workflows/wiki.yml). Pages link to each other with the wiki's own form, [[Page]] or
// [[Page#Section]]; images are paths relative to the wiki's root, under images/. Paintings are
// copied in from art/ at publish time, so images/paintings/<folder>/<rest> is looked for at
// art/<folder>/<rest>, for the folders the workflow copies (read from the workflow itself).
//
// REQUIRED lists, per page, the generated blocks and the pictures docs/specs/player-manual-wiki.md
// names for it. A stub (a page holding the line "This page is being written.") is exempt; once a
// page is written, every one of them must be on it.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../..');
const WIKI = join(ROOT, 'wiki');
const STUB = 'This page is being written.';
const CHROME = ['_Sidebar.md', '_Footer.md'];
/** The folders of art/ the publish job copies to images/paintings/: its `for folder in ...` loop. */
const PAINTINGS: readonly string[] =
  readFileSync(join(ROOT, '.github/workflows/wiki.yml'), 'utf8').match(/^\s*for folder in ([\w ]+); do$/m)?.[1]?.split(' ') ?? [];

const screen = (name: string): string => `images/screens/${name}.png`;
const sprite = (path: string): string => `images/art/${path}.png`;

/** Per page file: the `<!-- table: name -->` blocks and the image paths it must carry once written. */
const REQUIRED: Record<string, { tables: string[]; images: string[] }> = {
  'Home.md': { tables: [], images: [sprite('title/frontispiece')] },
  'Getting-Started.md': {
    tables: ['nations', 'difficulty-levels'],
    images: ['title', 'customize', 'choose-power', 'map-start', 'colony'].map(screen),
  },
  'Controls.md': { tables: ['controls'], images: [] },
  'Help-and-Options.md': { tables: ['options'], images: ['options', 'saves', 'encyclopedia'].map(screen) },
  'Tips-and-FAQ.md': { tables: [], images: [] },
  'Glossary.md': { tables: [], images: [] },
  'The-Map.md': {
    tables: ['terrain', 'pioneer-work', 'resources'],
    images: [
      ...['map-start', 'map-zoomed-out', 'map-tooltip'].map(screen),
      ...['plains-river', 'plains-major-river', 'plains-road', 'plains-plowed'].map((t) => sprite(`terrain/${t}`)),
    ],
  },
  'Units.md': { tables: ['units', 'professions'], images: [] },
  'Combat.md': { tables: ['combat-modifiers'], images: [screen('combat-analysis')] },
  'Colonies.md': { tables: ['goods'], images: ['colony', 'colony-large', 'trade-route'].map(screen) },
  'Buildings.md': { tables: ['buildings'], images: [screen('colony-construction')] },
  'Europe-and-Trade.md': { tables: ['market', 'training', 'purchases'], images: ['europe', 'europe-recruit'].map(screen) },
  'The-Crown-and-Independence.md': { tables: ['expeditionary-force'], images: [] },
  'Native-Peoples.md': { tables: ['tribes'], images: [screen('native-settlement')] },
  'Founding-Fathers.md': { tables: ['fathers'], images: [screen('report-congress')] },
  'Other-Powers.md': { tables: [], images: [screen('report-foreign')] },
  'Reports-and-Advisers.md': {
    tables: [],
    images: [
      ...['congress', 'foreign', 'score', 'advisers'].map((p) => sprite(`portraits/${p}`)),
      ...['report-economic', 'report-colony', 'report-score'].map(screen),
    ],
  },
  'Score-and-Hall-of-Fame.md': { tables: ['score'], images: [screen('hall-of-fame')] },
  'Gallery.md': { tables: [], images: [] },
};

const fileOf = (title: string): string => `${title.trim().replace(/ /g, '-')}.md`;
const titleOf = (file: string): string => file.replace(/\.md$/, '').replace(/-/g, ' ');
/** GitHub's anchor for a heading or a section name: lower case, spaces to hyphens, punctuation dropped. */
const anchor = (text: string): string => text.trim().toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, '').replace(/ /g, '-');
const isStub = (text: string): boolean => text.split('\n').some((line) => line.trim() === STUB);

/** The [[...]] links of a page as { page, section }. `[[Text|Page]]` names the page after the bar. */
const wikiLinks = (text: string): { page: string; section: string | undefined }[] =>
  [...text.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => {
    const target = m[1]!.includes('|') ? m[1]!.slice(m[1]!.lastIndexOf('|') + 1) : m[1]!;
    const [page, section] = target.split('#', 2);
    return { page: page!.trim(), section: section?.trim() };
  });
const images = (text: string): string[] => [
  ...[...text.matchAll(/!\[[^\]]*\]\(\s*([^)\s]+)[^)]*\)/g)].map((m) => m[1]!),
  ...[...text.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]!),
];
const headings = (text: string): string[] => [...text.matchAll(/^#{2,3}\s+(.+?)\s*#*\s*$/gm)].map((m) => anchor(m[1]!));
const tableNames = (text: string): string[] => [...text.matchAll(/<!--\s*table:\s*([\w-]+)\s*-->/g)].map((m) => m[1]!);

/**
 * Every problem with a set of pages, as a sentence naming the page. `exists` says whether a path
 * relative to the repository root is a file.
 */
function problems(pages: ReadonlyMap<string, string>, exists: (path: string) => boolean): string[] {
  const found: string[] = [];
  const sidebar = pages.get('_Sidebar.md') ?? '';
  const inSidebar = new Set(wikiLinks(sidebar).map((l) => fileOf(l.page)));
  if (!pages.has('_Sidebar.md')) found.push('_Sidebar.md is missing');
  for (const [file, text] of pages) {
    const chrome = CHROME.includes(file);
    if (!chrome && !/^[A-Za-z0-9 ]+$/.test(titleOf(file))) found.push(`${file}: the title "${titleOf(file)}" holds something other than letters, digits and spaces`);
    if (/^\s*#(?!#)/.test(text)) found.push(`${file}: starts with an H1 (the wiki shows the title; sections start at ##)`);
    if (!chrome && !inSidebar.has(file)) found.push(`${file}: not linked from _Sidebar.md`);
    for (const { page, section } of wikiLinks(text)) {
      const target = pages.get(fileOf(page));
      if (target === undefined || CHROME.includes(fileOf(page))) {
        found.push(`${file}: [[${page}]] names no page`);
        continue;
      }
      if (section !== undefined && !headings(target).includes(anchor(section))) found.push(`${file}: [[${page}#${section}]] names no ## or ### heading of ${fileOf(page)}`);
    }
    for (const m of text.matchAll(/(?<!!)\[[^\]]*\]\(\s*([^)\s]*)[^)]*\)/g)) {
      if (!/^(https?:|mailto:)/.test(m[1]!)) found.push(`${file}: "${m[0]}" is a Markdown link to a page; use [[Page]]`);
    }
    for (const path of images(text)) {
      const paintings = path.match(/^images\/paintings\/(.+)$/);
      const copied = paintings !== null && PAINTINGS.includes(paintings[1]!.split('/')[0]!);
      const onDisk = paintings ? (copied ? `art/${paintings[1]}` : undefined) : /^images\/./.test(path) ? `wiki/${path}` : undefined;
      if (onDisk === undefined || path.includes('..') || !exists(onDisk)) found.push(`${file}: the image ${path} is not a file under wiki/images/ or a folder of art/ the workflow copies`);
    }
    if (!chrome && isStub(text)) {
      // the summary is the first line a reader sees: HTML comments (the table markers among them) do not count
      const lines = text.replace(/<!--[\s\S]*?-->/g, '').split('\n').map((l) => l.trim()).filter(Boolean);
      if (lines.filter((l) => l === STUB).length !== 1 || lines[0] === STUB || lines[0]!.startsWith('#')) found.push(`${file}: a stub is a one-line summary, then the line "${STUB}" once`);
    }
    const opens = text.match(/<!--\s*table:\s*[\w-]+\s*-->/g)?.length ?? 0;
    const closes = text.match(/<!--\s*\/table\s*-->/g)?.length ?? 0;
    const blocks = text.match(/<!--\s*table:\s*[\w-]+\s*-->[\s\S]*?<!--\s*\/table\s*-->/g)?.length ?? 0;
    if (opens !== blocks || closes !== blocks) found.push(`${file}: a <!-- table: name --> block has no closing <!-- /table -->`);
    const required = REQUIRED[file];
    if (required && !isStub(text)) {
      const tables = tableNames(text);
      for (const t of required.tables) if (!tables.includes(t)) found.push(`${file}: the generated block "${t}" is missing`);
      const pictures = images(text);
      for (const i of required.images) if (!pictures.includes(i)) found.push(`${file}: the picture ${i} is missing`);
    }
  }
  return found;
}

const readWiki = (): Map<string, string> =>
  new Map(readdirSync(WIKI).filter((f) => f.endsWith('.md')).sort().map((f) => [f, readFileSync(join(WIKI, f), 'utf8')]));
const onDisk = (path: string): boolean => existsSync(join(ROOT, path)) && statSync(join(ROOT, path)).isFile();

describe('the wiki pages', () => {
  const pages = readWiki();

  it('are every page REQUIRED names, the sidebar and the footer, and nothing else', () => {
    expect([...pages.keys()].sort()).toEqual([...Object.keys(REQUIRED), ...CHROME].sort());
  });

  it('have no broken link or image, no H1, no stray page, and every required block and picture once written', () => {
    expect(problems(pages, onDisk)).toEqual([]);
  });

  it('the paintings are the nine folders the workflow copies, each in art/', () => {
    expect(PAINTINGS).toEqual(['units', 'places', 'features', 'floors', 'buildings', 'goods', 'portraits', 'title', 'chart']);
    for (const folder of PAINTINGS) expect(existsSync(join(ROOT, 'art', folder)), folder).toBe(true);
  });

  it('a folder is not an image', () => {
    expect(onDisk('art/units')).toBe(false);
    expect(onDisk('art/title/frontispiece.png')).toBe(true);
  });
});

describe('the checker', () => {
  const base = (): Map<string, string> =>
    new Map([
      ['_Sidebar.md', '[[Home]] · [[The Map]]\n'],
      ['_Footer.md', 'Free to play.\n'],
      ['Home.md', `Welcome. See [[The Map]].\n\n${STUB}\n`],
      ['The-Map.md', `The map.\n\n## Rivers and roads\n\n${STUB}\n`],
    ]);
  // art/elsewhere/ exists, so only the workflow's folder list can turn its painting away
  const files = new Set(['wiki/images/art/units/soldier.png', 'art/units/colonist.png', 'art/elsewhere/colonist.png']);
  const check = (edit: (pages: Map<string, string>) => void): string[] => {
    const pages = base();
    edit(pages);
    return problems(pages, (p) => files.has(p));
  };

  it('passes a good set', () => {
    expect(check(() => {})).toEqual([]);
    expect(check((p) => p.set('Home.md', `See [[The Map#Rivers and roads]] and [[the map|The Map]].\n\n![A soldier](images/art/units/soldier.png)\n<img src="images/paintings/units/colonist.png" width="160" alt="A colonist">\n\n${STUB}\n`))).toEqual([]);
  });

  it.each([
    ['a link to no page', (p: Map<string, string>) => p.set('Home.md', '[[Nowhere]]\n'), 'names no page'],
    ['a section the page lacks', (p: Map<string, string>) => p.set('Home.md', '[[The Map#Oceans]]\n'), 'names no ## or ### heading'],
    ['a sprite that is not there', (p: Map<string, string>) => p.set('Home.md', '![x](images/art/units/ghost.png)\n'), 'is not a file'],
    ['a painting in a folder the workflow does not copy', (p: Map<string, string>) => p.set('Home.md', `<img src="images/paintings/elsewhere/colonist.png">\n\n${STUB}\n`), 'is not a file'],
    ['a stub with no summary', (p: Map<string, string>) => p.set('Home.md', `${STUB}\n`), 'a stub is a one-line summary'],
    ['a stub whose summary is a comment', (p: Map<string, string>) => p.set('Home.md', `<!-- TODO -->\n${STUB}\n`), 'a stub is a one-line summary'],
    ['a stub that says so twice', (p: Map<string, string>) => p.set('Home.md', `Welcome.\n\n${STUB}\n${STUB}\n`), 'a stub is a one-line summary'],
    ['a painting that is not there', (p: Map<string, string>) => p.set('Home.md', '<img src="images/paintings/units/ghost.png">\n'), 'is not a file'],
    ['an image outside images/', (p: Map<string, string>) => p.set('Home.md', '![x](https://example.com/x.png)\n'), 'is not a file'],
    ['an H1', (p: Map<string, string>) => p.set('Home.md', '# Home\n\nText.\n'), 'starts with an H1'],
    ['a page missing from the sidebar', (p: Map<string, string>) => p.set('Units.md', 'Units.\n'), 'not linked from _Sidebar.md'],
    ['an unclosed block', (p: Map<string, string>) => p.set('Home.md', '<!-- table: x -->\nrows\n'), 'no closing'],
    ['a title with punctuation', (p: Map<string, string>) => {
      p.set('Tips,-FAQ.md', 'Tips.\n');
      p.set('_Sidebar.md', '[[Home]] · [[The Map]] · [[Tips, FAQ]]\n');
    }, 'holds something other than'],
    ['a bare Markdown link to a page', (p: Map<string, string>) => p.set('Home.md', '[the map](The-Map)\n'), 'use [[Page]]'],
  ])('catches %s', (_name, edit, message) => {
    expect(check(edit).join('\n')).toContain(message);
  });

  it('asks a written page, not a stub, for its required blocks and pictures', () => {
    const stub = check((p) => {
      p.set('Combat.md', `How fights are decided.\n\n${STUB}\n`);
      p.set('_Sidebar.md', '[[Home]] · [[The Map]] · [[Combat]]\n');
    });
    expect(stub).toEqual([]);
    const written = check((p) => {
      p.set('Combat.md', 'How fights are decided.\n\n## The throw\n\nText.\n');
      p.set('_Sidebar.md', '[[Home]] · [[The Map]] · [[Combat]]\n');
    });
    expect(written).toEqual(['Combat.md: the generated block "combat-modifiers" is missing', 'Combat.md: the picture images/screens/combat-analysis.png is missing']);
  });

  it('finds the anchor GitHub makes from a heading', () => {
    expect(anchor('Choosing a power')).toBe('choosing-a-power');
    expect(anchor("Food, growth and starvation!")).toBe('food-growth-and-starvation');
  });
});
