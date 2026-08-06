import { describe, it, expect, vi } from 'vitest';
import { pasteCandidateUrls, isPasteUrl, looksLikePaste, fetchPasteText } from './paste-url';

const PASTE = `Landorus-Therian @ Choice Scarf
Ability: Intimidate
- Earthquake`;

describe('pasteCandidateUrls', () => {
  it('maps a pokepast.es link to raw then json', () => {
    expect(pasteCandidateUrls('https://pokepast.es/abcdef0123456789')).toEqual([
      'https://pokepast.es/abcdef0123456789/raw',
      'https://pokepast.es/abcdef0123456789/json',
    ]);
  });

  it('passes through an explicit raw link untouched', () => {
    expect(pasteCandidateUrls('https://pokepast.es/abc123/raw')).toEqual([
      'https://pokepast.es/abc123/raw',
    ]);
  });

  it('handles pokebin and showdown-teams shapes', () => {
    expect(pasteCandidateUrls('https://pokebin.com/xyz789')).toEqual([
      'https://pokebin.com/xyz789/raw',
      'https://pokebin.com/raw/xyz789',
    ]);
    expect(pasteCandidateUrls('https://teams.pokemonshowdown.com/gen9vgc-123')[0])
      .toBe('https://teams.pokemonshowdown.com/gen9vgc-123/raw');
  });

  it('refuses non-URLs, multi-line pastes, and unknown hosts', () => {
    expect(pasteCandidateUrls(PASTE)).toEqual([]);
    expect(pasteCandidateUrls('not a url')).toEqual([]);
    expect(pasteCandidateUrls('https://evil.example/pokepast.es/abc')).toEqual([]);
    expect(isPasteUrl('https://pokepast.es/abcdef')).toBe(true);
    expect(isPasteUrl(PASTE)).toBe(false);
  });

  it('trailing slashes do not break id detection', () => {
    expect(pasteCandidateUrls('https://pokepast.es/abc123/')[0])
      .toBe('https://pokepast.es/abc123/raw');
  });
});

describe('looksLikePaste', () => {
  it('accepts real paste text and rejects HTML error pages', () => {
    expect(looksLikePaste(PASTE)).toBe(true);
    expect(looksLikePaste('<!DOCTYPE html><html><body>404</body></html>')).toBe(false);
    expect(looksLikePaste('')).toBe(false);
  });
});

describe('fetchPasteText', () => {
  it('returns the body of the first candidate that looks like a paste', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, text: async () => PASTE });
    const out = await fetchPasteText('https://pokepast.es/abc123', fetcher as unknown as typeof fetch);
    expect(out).toBe(PASTE);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('falls through to the json candidate and unwraps { paste }', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: false, text: async () => '' })
      .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify({ paste: PASTE }) });
    const out = await fetchPasteText('https://pokepast.es/abc123', fetcher as unknown as typeof fetch);
    expect(out).toBe(PASTE);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('returns null when every candidate fails (CORS/network)', async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError('blocked'));
    const out = await fetchPasteText('https://pokepast.es/abc123', fetcher as unknown as typeof fetch);
    expect(out).toBeNull();
  });

  it('never fetches for plain paste text', async () => {
    const fetcher = vi.fn();
    const out = await fetchPasteText(PASTE, fetcher as unknown as typeof fetch);
    expect(out).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
