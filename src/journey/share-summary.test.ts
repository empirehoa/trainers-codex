import { describe, it, expect } from 'vitest';
import { buildEmojiSummary } from './share';

const base = {
  stats: { badges: 0, titles: 0, shinies: 0, peakRank: 999, wins: 0, losses: 0 },
  chapterCount: 12,
  score: 4200,
};

describe('buildEmojiSummary', () => {
  it('renders an 8-slot badge strip, filled + empty', () => {
    const s = buildEmojiSummary({ ...base, stats: { ...base.stats, badges: 5 } });
    const strip = s.split('\n')[0];
    expect(strip).toBe('🏅🏅🏅🏅🏅◽◽◽');
  });

  it('clamps badges to the strip length and never goes negative', () => {
    expect(buildEmojiSummary({ ...base, stats: { ...base.stats, badges: 30 } }).split('\n')[0])
      .toBe('🏅'.repeat(8));
    expect(buildEmojiSummary({ ...base, stats: { ...base.stats, badges: -2 } }).split('\n')[0])
      .toBe('◽'.repeat(8));
  });

  it('omits zero-valued superlatives (no zero-noise)', () => {
    const s = buildEmojiSummary(base);
    expect(s).not.toContain('🏆');
    expect(s).not.toContain('✨');
    expect(s).not.toContain('📈');
    expect(s).not.toContain('⚔️');
    expect(s).toContain('🎂12yr');
  });

  it('includes titles, shinies, peak rank, and win rate when earned', () => {
    const s = buildEmojiSummary({
      ...base,
      stats: { badges: 8, titles: 2, shinies: 1, peakRank: 3, wins: 30, losses: 10 },
    });
    expect(s).toContain('🏆×2');
    expect(s).toContain('✨×1');
    expect(s).toContain('📈#3');
    expect(s).toContain('⚔️75%');
  });

  it('unranked careers (999) never show a peak rank', () => {
    const s = buildEmojiSummary({ ...base, stats: { ...base.stats, peakRank: 999, wins: 1, losses: 0 } });
    expect(s).not.toContain('📈');
  });

  it('is deterministic — same input, same string', () => {
    const a = buildEmojiSummary(base);
    const b = buildEmojiSummary(base);
    expect(a).toBe(b);
  });

  it('stays spoiler-free: no species names, no route text, only emoji + counters', () => {
    const s = buildEmojiSummary({
      ...base,
      stats: { badges: 3, titles: 1, shinies: 2, peakRank: 12, wins: 9, losses: 3 },
    });
    // Nothing alphabetic beyond the fixed unit suffixes may leak into the strip.
    expect(s.replace(/yr/g, '')).not.toMatch(/[a-z]{3,}/i);
  });
});
