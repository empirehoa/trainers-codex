import { describe, it, expect } from 'vitest';
import { parseSearchParam } from './search-param';

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
