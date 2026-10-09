// A reference for what the map canvas must show (R-1006). It runs the game's own render() against
// a plain pixel buffer instead of a browser canvas: every draw is a solid rectangle or a sprite
// blown up by a whole number, so the result is fully determined by the art and owes nothing to
// any platform's rasteriser. The browser's canvas is then required to match it exactly.
import type { GameState } from '../../src/engine/state';
import { miniTileArt, PALETTE, tileArt, toRgba, type Sprite } from '../../src/ui/pixel-art';
import { render, type RenderExtras } from '../../src/ui/render';
import { DETAIL_FROM, lookKey, type TileCache } from '../../src/ui/tiles';
import type { View } from '../../src/ui/view';

interface Art {
  readonly sprite: Sprite;
  readonly rgba: Uint8ClampedArray;
}

/** The pixels render() produces for this state and view, as RGB triples row by row. */
export function referencePixels(state: GameState, view: View, extras: RenderExtras): { width: number; height: number; rgb: Uint8Array } {
  const { width, height } = view;
  const rgb = new Uint8Array(width * height * 3);
  let fill: [number, number, number] = [0, 0, 0];
  const ctx = {
    imageSmoothingEnabled: true,
    set fillStyle(hex: string) {
      if (!(PALETTE as readonly string[]).includes(hex)) throw new Error(`a colour outside the palette was used: ${hex}`);
      fill = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
    },
    fillRect(x: number, y: number, w: number, h: number): void {
      for (let py = Math.max(0, y); py < Math.min(height, y + h); py++) {
        for (let px = Math.max(0, x); px < Math.min(width, x + w); px++) rgb.set(fill, (py * width + px) * 3);
      }
    },
    drawImage(art: Art, x: number, y: number, w: number, h: number): void {
      const n = art.sprite.size;
      if (!Number.isInteger(x) || !Number.isInteger(y) || w % n !== 0 || h !== w) throw new Error(`art drawn off the pixel grid: ${n} px art at (${x}, ${y}), ${w} x ${h}`);
      if (this.imageSmoothingEnabled) throw new Error('art drawn with smoothing on');
      const scale = w / n;
      for (let sy = 0; sy < n; sy++) {
        for (let sx = 0; sx < n; sx++) {
          const i = (sy * n + sx) * 4;
          if (art.rgba[i + 3] === 0) continue;
          for (let dy = 0; dy < scale; dy++) {
            const py = y + sy * scale + dy;
            if (py < 0 || py >= height) continue;
            for (let dx = 0; dx < scale; dx++) {
              const px = x + sx * scale + dx;
              if (px < 0 || px >= width) continue;
              rgb.set([art.rgba[i] as number, art.rgba[i + 1] as number, art.rgba[i + 2] as number], (py * width + px) * 3);
            }
          }
        }
      }
    },
  };
  const made = new Map<string, Art>();
  const keep = (key: string, make: () => Sprite): Art => {
    let art = made.get(key);
    if (!art) {
      const sprite = make();
      art = { sprite, rgba: toRgba(sprite) };
      made.set(key, art);
    }
    return art;
  };
  const cache = {
    get: (look: Parameters<TileCache['get']>[0], size: number) => keep(lookKey(look, size), () => (size < DETAIL_FROM ? miniTileArt(look) : tileArt(look))),
    sprite: (key: string, make: () => Sprite) => keep(`sprite|${key}`, make),
    size: 0,
  };
  render(ctx as unknown as CanvasRenderingContext2D, state, view, cache as unknown as TileCache, extras);
  return { width, height, rgb };
}

/** FNV-1a over the pixels, the same fingerprint the browser test takes of the canvas. */
export function fingerprint(rgb: Uint8Array): string {
  let h = 2166136261;
  for (let i = 0; i < rgb.length; i += 3) h = Math.imul(h ^ (((rgb[i] as number) << 16) | ((rgb[i + 1] as number) << 8) | (rgb[i + 2] as number)), 16777619);
  return (h >>> 0).toString(16).padStart(8, '0');
}
