// Canvas text fitting, shared by the poster renderers (lib/posters.ts).
//
// `fillText` has a `maxWidth` argument, but it fits by squashing the glyphs
// horizontally — a 60-character team name becomes an unreadable smear rather
// than a shorter string. These two helpers fit the way a layout would: shrink
// the font a step at a time down to a floor, then truncate with an ellipsis.
// Both measure with whatever font is set on the context when they are called.

/**
 * Truncate `text` with a single `…` until it measures at most `maxWidth` in the
 * context's current font. Returns the input unchanged when it already fits.
 */
export function ellipsize(c: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (c.measureText(text).width <= maxWidth) return text;
  const ELLIPSIS = '…';
  // Binary-search the longest prefix that fits with the ellipsis appended.
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    const candidate = text.slice(0, mid).trimEnd() + ELLIPSIS;
    if (c.measureText(candidate).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo === 0 ? ELLIPSIS : text.slice(0, lo).trimEnd() + ELLIPSIS;
}

/**
 * Fit a single line into `maxWidth`: step the font size down from `startPx` in
 * 2px steps to `minPx`, then ellipsize whatever still does not fit. Leaves the
 * context's font set to the chosen size and returns the string to draw.
 *
 * `font` builds the full CSS font string for a size, e.g.
 * `px => \`bold ${px}px "Sora", system-ui\``.
 */
export function fitLine(
  c: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  startPx: number,
  font: (px: number) => string,
  minPx: number,
): string {
  let px = startPx;
  c.font = font(px);
  while (c.measureText(text).width > maxWidth && px - 2 >= minPx) {
    px -= 2;
    c.font = font(px);
  }
  return ellipsize(c, text, maxWidth);
}
