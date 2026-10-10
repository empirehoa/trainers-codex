import { describe, it, expect } from 'vitest';
import { ellipsize, fitLine } from './canvas-text';

// A context whose glyphs are all `pxPerChar` wide at the current font size —
// enough to exercise the fitting logic without a canvas.
function fakeCtx(): CanvasRenderingContext2D {
  const c = { font: '20px x' } as unknown as CanvasRenderingContext2D;
  c.measureText = (t: string) => ({ width: t.length * parseFloat(c.font) * 0.6 } as TextMetrics);
  return c;
}

describe('ellipsize', () => {
  it('leaves fitting text alone', () => {
    expect(ellipsize(fakeCtx(), 'short', 1000)).toBe('short');
  });
  it('truncates with a single ellipsis to within maxWidth', () => {
    const c = fakeCtx();
    const out = ellipsize(c, 'W'.repeat(200), 300);
    expect(out.endsWith('…')).toBe(true);
    expect(c.measureText(out).width).toBeLessThanOrEqual(300);
    expect(out.length).toBe(25); // 24 chars + ellipsis at 12px/char
  });
  it('degrades to the bare ellipsis when nothing fits', () => {
    expect(ellipsize(fakeCtx(), 'anything', 5)).toBe('…');
  });
});

describe('fitLine', () => {
  it('shrinks the font first, then ellipsizes at the floor', () => {
    const c = fakeCtx();
    const font = (px: number) => `${px}px x`;
    // 30 chars × 0.6 × 20px = 360 > 300 → 18px gives 324, 16px gives 288 ✓
    expect(fitLine(c, 'a'.repeat(30), 300, 20, font, 12)).toBe('a'.repeat(30));
    expect(c.font).toBe('16px x');
    // 200 chars never fit above the 12px floor → ellipsized at 12px
    const out = fitLine(c, 'b'.repeat(200), 300, 20, font, 12);
    expect(c.font).toBe('12px x');
    expect(out.endsWith('…')).toBe(true);
    expect(c.measureText(out).width).toBeLessThanOrEqual(300);
  });
});
