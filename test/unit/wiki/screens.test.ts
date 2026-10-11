// R-1026: the screenshots of the game's screens for the player manual, in wiki/images/screens/.
// They are written by test/e2e/wiki-shots.spec.ts; regenerate them after changing a screen with
//
//   WIKI_SHOTS=1 npx playwright test test/e2e/wiki-shots.spec.ts
//
// This test checks only that every picture named here is there at 1280 x 800 and that nothing else
// is; whether a picture still shows the screen as it is now is not checked.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = join(__dirname, '../../../wiki/images/screens');

/** Every screenshot the manual has, by file name without the .png. */
export const SCREENS = [
  'title', 'customize', 'choose-power', 'audience',
  'map-start', 'map-zoomed-out', 'map-tooltip',
  'colony', 'colony-construction', 'colony-large',
  'europe', 'europe-recruit',
  'report-economic', 'report-colony', 'report-foreign', 'report-congress', 'report-score',
  'encyclopedia', 'combat-analysis', 'options', 'saves', 'hall-of-fame', 'game-over',
  'trade-route', 'native-settlement', 'declaration', 'congress-choice', 'rumor',
] as const;

/** Width and height from a PNG's IHDR chunk, or null if the bytes are not a PNG. */
function ihdrSize(bytes: Buffer): { width: number; height: number } | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || signature.some((b, i) => bytes[i] !== b)) return null;
  if (bytes.toString('latin1', 12, 16) !== 'IHDR') return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe('wiki screenshots', () => {
  const present = readdirSync(DIR).filter((f) => f.endsWith('.png')).sort();

  it.each(SCREENS)('%s.png is there at 1280 x 800', (name) => {
    expect(present).toContain(`${name}.png`);
    expect(ihdrSize(readFileSync(join(DIR, `${name}.png`)))).toEqual({ width: 1280, height: 800 });
  });

  it('holds no picture the list does not name', () => {
    const named = new Set<string>(SCREENS.map((name) => `${name}.png`));
    expect(present.filter((f) => !named.has(f))).toEqual([]);
  });

  it('reads the size of a PNG from its header, and refuses what is not one', () => {
    const header = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header);
    header.write('IHDR', 12, 'latin1');
    header.writeUInt32BE(640, 16);
    header.writeUInt32BE(400, 20);
    expect(ihdrSize(header)).toEqual({ width: 640, height: 400 });
    expect(ihdrSize(Buffer.from('not a picture at all, not even close'))).toBeNull();
  });
});
