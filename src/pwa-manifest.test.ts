import { describe, it, expect } from 'vitest';
// `?raw` (vite/client) rather than a JSON import: resolveJsonModule only covers
// the .json extension, and the manifest must keep its .webmanifest name so the
// deploy header rule in public/_headers pins its MIME type.
import manifestRaw from '../public/manifest.webmanifest?raw';

// The manifest `name` is what Chrome/Android install prompts, splash screens
// and PWABuilder store packages use as the listing title. That is a store
// listing, and CLAUDE.md's bright line is that no third-party mark appears in
// the app title, domain or store listings. The description is the listing
// blurb, and merch stays out of it until MERCH_CHECKOUT ships.
describe('public/manifest.webmanifest', () => {
  const m = JSON.parse(manifestRaw) as { name: string; short_name: string; description: string };

  it('parses as JSON with the fields an installer reads', () => {
    expect(m.name.length).toBeGreaterThan(3);
    expect(m.short_name.length).toBeLessThanOrEqual(16);
    expect(m.description.length).toBeGreaterThan(20);
  });

  it('keeps third-party marks out of the install / store-listing name', () => {
    expect(m.name).not.toMatch(/pok[eé]mon/i);
    expect(m.short_name).not.toMatch(/pok[eé]mon/i);
    expect(m.description).not.toMatch(/pok[eé]mon/i);
  });

  it('does not pitch merch while checkout is dark', () => {
    expect(m.description).not.toMatch(/merch|printful|print-on-demand/i);
  });
});
