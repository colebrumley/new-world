import { describe, expect, it } from 'vitest';
import { PAINTING, paintingScale } from '../../../src/ui/title';

describe('the size the title painting hangs at', () => {
  it('is the largest whole multiple that leaves the wood showing round it', () => {
    expect(paintingScale(1024, 640)).toBe(3); // the smallest window the game supports
    expect(paintingScale(1280, 800)).toBe(3); // four times would fill the window edge to edge and hide the frame
    expect(paintingScale(1296, 816)).toBe(4);
    expect(paintingScale(1920, 1080)).toBe(5);
    expect(paintingScale(2560, 1440)).toBe(7);
  });

  it('is never stretched: the narrower way of the window decides', () => {
    expect(paintingScale(3000, 640)).toBe(3);
    expect(paintingScale(1024, 3000)).toBe(3);
    for (let width = 300; width <= 2600; width += 37) {
      for (let height = 200; height <= 1600; height += 41) {
        const scale = paintingScale(width, height);
        expect(Number.isInteger(scale)).toBe(true);
        expect(scale).toBeGreaterThanOrEqual(1);
        if (scale > 1) {
          expect(PAINTING.width * scale + 2 * PAINTING.margin).toBeLessThanOrEqual(width);
          expect(PAINTING.height * scale + 2 * PAINTING.margin).toBeLessThanOrEqual(height);
        }
        // and no larger whole multiple would fit
        expect(PAINTING.width * (scale + 1) + 2 * PAINTING.margin > width || PAINTING.height * (scale + 1) + 2 * PAINTING.margin > height).toBe(true);
      }
    }
  });

  it('is its own size in a window too small for it', () => {
    expect(paintingScale(200, 100)).toBe(1);
    expect(paintingScale(0, 0)).toBe(1);
  });
});
