import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  parseSearchParam, parseShareHash, MAX_SHARE_NAME_LENGTH,
  initialSearchQuery, entrySource, markEntry, ENTRY_KEY,
} from './search-param';

describe('parseSearchParam', () => {
  it('reads the q param with or without a leading ?', () => {
    expect(parseSearchParam('?q=Gengar')).toBe('Gengar');
    expect(parseSearchParam('q=Gengar')).toBe('Gengar');
  });

  it('decodes what the reference pages actually emit', () => {
    // scripts/gen-seo-pages.ts builds these with encodeURIComponent, so every
    // multi-word and punctuated display name arrives percent-encoded.
    expect(parseSearchParam('?q=Charizard%20Mega%20X')).toBe('Charizard Mega X');
    expect(parseSearchParam('?q=Farfetch%27d')).toBe("Farfetch'd");
    expect(parseSearchParam('?q=Type%3A%20Null')).toBe('Type: Null');
    expect(parseSearchParam('?q=Mr.%20Mime')).toBe('Mr. Mime');
    // A '+' in a query string is a space, which is what URLSearchParams does
    // and what a hand-typed link is likely to contain.
    expect(parseSearchParam('?q=Mr.+Mime')).toBe('Mr. Mime');
  });

  it('returns empty string for everything absent or blank', () => {
    expect(parseSearchParam('')).toBe('');
    expect(parseSearchParam('?')).toBe('');
    expect(parseSearchParam('?seed=8843')).toBe('');
    expect(parseSearchParam('?q=')).toBe('');
    expect(parseSearchParam('?q=%20%20')).toBe('');
  });

  it('coexists with the journey deep-link params', () => {
    expect(parseSearchParam('?ff=JOURNEY:1&q=Lucario&seed=42')).toBe('Lucario');
  });

  it('truncates rather than passing a payload into the search box', () => {
    const long = 'a'.repeat(500);
    expect(parseSearchParam(`?q=${long}`)).toHaveLength(64);
  });

  it('does not interpret the value — it is only ever a filter string', () => {
    // The value reaches React as text content, never as markup, so escaping is
    // React's job. This asserts we do not "helpfully" strip or rewrite it.
    expect(parseSearchParam('?q=%3Cscript%3E')).toBe('<script>');
  });
});

describe('parseShareHash', () => {
  it('returns null without a team segment', () => {
    expect(parseShareHash('')).toBeNull();
    expect(parseShareHash('#t=25-6')).toBeNull();
    expect(parseShareHash('#tn=hello')).toBeNull();
  });

  it('reads the code and decodes the labels', () => {
    expect(parseShareHash('#team=25-6-9&tn=Rain%20Squad&by=Ash')).toEqual({ code: '25-6-9', teamName: 'Rain Squad', by: 'Ash' });
    expect(parseShareHash('#x=1&team=25-6')).toEqual({ code: '25-6', teamName: undefined, by: undefined });
  });

  it('caps a 20 KB name to the share limit and collapses whitespace', () => {
    const big = encodeURIComponent('Z'.repeat(20_000));
    const r = parseShareHash(`#team=25-6-9-3-143-149&tn=${big}&by=${big}`)!;
    expect(r.teamName!.length).toBeLessThanOrEqual(MAX_SHARE_NAME_LENGTH);
    expect(r.by!.length).toBeLessThanOrEqual(MAX_SHARE_NAME_LENGTH);
    expect(parseShareHash('#team=25&tn=a%20%20%20%20%20b')!.teamName).toBe('a b');
    expect(parseShareHash('#team=25&tn=%20%20')!.teamName).toBeUndefined();
  });

  it('drops a label that is not valid percent-encoding instead of throwing', () => {
    expect(parseShareHash('#team=25&tn=%E0%A4%A&by=ok')).toEqual({ code: '25', teamName: undefined, by: 'ok' });
  });
});

describe('entry attribution — the ?q= session flag', () => {
  function installSession(store = new Map<string, string>()) {
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    });
    return store;
  }

  afterEach(() => vi.unstubAllGlobals());

  it('is null in a tab that never consumed a ?q=', () => {
    installSession();
    vi.stubGlobal('window', { location: { search: '?seed=8843' } });
    expect(initialSearchQuery()).toBe('');
    expect(entrySource()).toBeNull();
  });

  it("marks the session 'seo' when a valid ?q= is consumed", () => {
    const store = installSession();
    vi.stubGlobal('window', { location: { search: '?q=Gengar' } });
    expect(initialSearchQuery()).toBe('Gengar');
    expect(store.get(ENTRY_KEY)).toBe('seo');
    expect(entrySource()).toBe('seo');
  });

  it('does not mark the session for a blank ?q=', () => {
    installSession();
    vi.stubGlobal('window', { location: { search: '?q=%20' } });
    expect(initialSearchQuery()).toBe('');
    expect(entrySource()).toBeNull();
  });

  it('ignores any value other than the one it writes', () => {
    const store = installSession();
    store.set(ENTRY_KEY, 'paid');
    expect(entrySource()).toBeNull();
  });

  it('degrades to null when sessionStorage is unavailable', () => {
    vi.stubGlobal('sessionStorage', {
      getItem() { throw new Error('denied'); },
      setItem() { throw new Error('denied'); },
    });
    expect(() => markEntry('seo')).not.toThrow();
    expect(entrySource()).toBeNull();
  });
});
