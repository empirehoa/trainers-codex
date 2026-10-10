// Derived-silhouette primitives — shared by every renderer whose output can be
// printed: the Journey Legend Card (src/journey/legend-card.ts, card-video.ts)
// and the Merch Studio designs (src/lib/merch-renderers.ts).
//
// ── The rule ─────────────────────────────────────────────────────────────
// Nothing that reaches fulfilment carries official artwork. A roster figure is
// rendered as a DERIVED silhouette: the PIXEL sprite (never the 'artwork-*'
// Sugimori art, never the 'home-*' 3D renders) is drawn into an offscreen
// canvas, reduced to its alpha channel, and re-filled with a type-derived
// gradient. The source pixels never reach the output. A solid-fill mask is
// materially further from the copyrighted artwork than a reproduction of it,
// which matters a great deal more when the output is printed for sale than
// when it is on screen.
//
// Sprite loads are bounded (gotcha 11) and a failed or timed-out sprite
// degrades to a type-coloured glyph, so a print never blocks on the mirror and
// never falls back to a different art variant.

import type { SpriteKind } from './types';
import { spriteUrl } from './pokemon';

/**
 * How long to wait for one sprite before giving up on it.
 *
 * A bare image load has no timeout: `onerror` fires for a refused or 404'd
 * request, but a request that merely HANGS — captive portal, dead proxy,
 * throttled mobile connection, the sprite mirror rate-limiting — never settles
 * either way. Without this bound the whole render awaits forever and the user
 * watches a spinner instead of getting their result. The sprites are
 * decorative input to a silhouette mask, so timing one out costs a fallback
 * shape and nothing else.
 */
export const SPRITE_TIMEOUT_MS = 4000;

export function loadImg(src: string, timeoutMs = SPRITE_TIMEOUT_MS): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      // Cancel the in-flight fetch so a hung request can't keep the
      // connection (or the decode) alive behind us.
      img.src = '';
      rej(new Error('img timeout: ' + src));
    }, timeoutMs);

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    img.crossOrigin = 'anonymous';
    img.onload = () => finish(() => res(img));
    img.onerror = () => finish(() => rej(new Error('img failed: ' + src)));
    img.src = src;
  });
}

/**
 * The only sprite variants a print renderer may fetch. Both are the 96×96 pixel
 * sprites; the silhouette mask discards their pixels anyway.
 */
export type PrintSpriteKind = Extract<SpriteKind, 'pixel-default' | 'pixel-shiny'>;

export function printSpriteUrl(id: number, shiny: boolean): string {
  const kind: PrintSpriteKind = shiny ? 'pixel-shiny' : 'pixel-default';
  return spriteUrl(id, kind);
}

/**
 * Rounded rect with a capability guard.
 *
 * Per CLAUDE.md gotcha #9 this tests `typeof (c as {...}).roundRect` rather
 * than `'roundRect' in c` — the latter narrows the else branch to `never` and
 * TypeScript then rejects the fallback path.
 */
export function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  if (typeof (c as { roundRect?: unknown }).roundRect === 'function') {
    c.beginPath();
    (c as CanvasRenderingContext2D & { roundRect(x: number, y: number, w: number, h: number, r: number): void })
      .roundRect(x, y, w, h, r);
    return;
  }
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/**
 * Reduce an image to a solid silhouette in `color`.
 *
 * Uses `source-in` compositing against the image's own alpha, so only the
 * shape survives — no source colour, no interior detail.
 */
export function silhouetteFrom(
  img: HTMLImageElement,
  size: number,
  color: string,
  accent: string,
): HTMLCanvasElement {
  const off = document.createElement('canvas');
  off.width = size;
  off.height = size;
  const oc = off.getContext('2d');
  if (!oc) return off;

  oc.imageSmoothingEnabled = true;
  oc.drawImage(img, 0, 0, size, size);

  // Keep the alpha, replace everything else with a type-derived gradient.
  oc.globalCompositeOperation = 'source-in';
  const grad = oc.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, accent);
  grad.addColorStop(1, color);
  oc.fillStyle = grad;
  oc.fillRect(0, 0, size, size);
  oc.globalCompositeOperation = 'source-over';

  return off;
}

/** Placeholder used when a sprite can't be fetched (offline, rate-limited). */
export function fallbackSilhouette(size: number, color: string, accent: string): HTMLCanvasElement {
  const off = document.createElement('canvas');
  off.width = size;
  off.height = size;
  const oc = off.getContext('2d');
  if (!oc) return off;
  const grad = oc.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, accent);
  grad.addColorStop(1, color);
  oc.fillStyle = grad;
  // A neutral capsule — reads as "a member was here" without pretending to be
  // a specific creature.
  const pad = size * 0.18;
  roundRect(oc, pad, pad, size - pad * 2, size - pad * 2, size * 0.28);
  oc.fill();
  return off;
}

/**
 * Fetch the pixel sprite for `id` and return it as a silhouette mask of
 * `size`×`size`; on any failure or timeout return the type-coloured glyph
 * instead. This is the single entry point print renderers should use — it is
 * impossible to reach an artwork URL through it.
 */
export async function loadSilhouette(
  id: number,
  shiny: boolean,
  size: number,
  color: string,
  accent: string,
): Promise<HTMLCanvasElement> {
  try {
    const img = await loadImg(printSpriteUrl(id, shiny));
    return silhouetteFrom(img, size, color, accent);
  } catch {
    // Sprites are decorative here and the mirror rate-limits occasionally
    // (CLAUDE.md debugging step 5) — the print must still render.
    return fallbackSilhouette(size, color, accent);
  }
}

export function fitText(
  c: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  startPx: number,
  font: (px: number) => string,
  minPx = 18,
): number {
  let px = startPx;
  c.font = font(px);
  while (c.measureText(text).width > maxWidth && px > minPx) {
    px -= 2;
    c.font = font(px);
  }
  return px;
}
