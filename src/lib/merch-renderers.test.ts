// The merch bright line, pinned.
//
// Every PNG that leaves renderMerchDesign() can reach Printful fulfilment, so
// two things must never be true of it:
//
//   1. It must never be composed from official artwork. The renderers may fetch
//      the pixel sprite as INPUT to an alpha-mask silhouette (the Legend Card
//      posture — see src/lib/silhouette.ts), but no 'artwork-*' / 'home-*'
//      variant may be requested at all, and no fetched image may be drawn to
//      the print canvas directly.
//   2. It must never auto-print a species name. Nicknames are the user's own
//      text; everything else on the print is a type / role / slot label.
//
// vitest runs in node, so the DOM surface the renderers touch — document,
// Image, a 2D context — is stubbed here. The stub records every URL requested
// and every fillText/drawImage argument, which is exactly the evidence the two
// assertions need.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MERCH_DESIGNS, renderMerchDesign, renderMerchPreview, type MerchDesign } from './merch-renderers';
import { MERCH_PRODUCTS } from './merch';
import { POKEMON_BY_ID } from './pokemon';
import type { TeamMember, TrainerProfile } from './types';

const FORBIDDEN_URL = /official-artwork|\/home\/|artwork-/;

interface Recorder {
  urls: string[];
  fillText: string[];
  /** Constructor name of everything handed to drawImage on a PRINT context. */
  drawnOnPrint: string[];
}

class StubImage {
  static rec: Recorder;
  /** URLs that should fail to load, to exercise the fallback path. */
  static failing = /$^/;
  crossOrigin = '';
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  width = 96;
  height = 96;
  private _src = '';
  set src(v: string) {
    this._src = v;
    if (!v) return;
    StubImage.rec.urls.push(v);
    const fail = StubImage.failing.test(v);
    setTimeout(() => (fail ? this.onerror?.() : this.onload?.()), 0);
  }
  get src() { return this._src; }
}

/** A canvas whose 2D context accepts anything and records what matters. */
class StubCanvas {
  static rec: Recorder;
  width = 0;
  height = 0;
  /** Offscreen canvases (silhouette masks) never leave the browser; print canvases do. */
  isPrint = false;
  getContext = (): unknown => {
    const gradient = { addColorStop() { /* noop */ } };
    const state: Record<string, unknown> = {};
    return new Proxy({}, {
      get: (_t, prop: string) => {
        if (prop === 'canvas') return this;
        if (prop === 'measureText') return (text: string) => ({ width: text.length * 10 });
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => gradient;
        if (prop === 'fillText') return (text: string) => { StubCanvas.rec.fillText.push(text); };
        if (prop === 'drawImage') return (img: object) => {
          if (this.isPrint) StubCanvas.rec.drawnOnPrint.push(img.constructor.name);
        };
        if (prop in state) return state[prop];
        return () => { /* every other 2D call is a no-op */ };
      },
      set: (_t, prop: string, value) => { state[prop] = value; return true; },
    });
  };
  toBlob(cb: (b: Blob | null) => void) { cb(new Blob(['png'], { type: 'image/png' })); }
}

let rec: Recorder;

beforeEach(() => {
  rec = { urls: [], fillText: [], drawnOnPrint: [] };
  StubImage.rec = rec;
  StubImage.failing = /$^/;
  StubCanvas.rec = rec;
  vi.stubGlobal('Image', StubImage);
  vi.stubGlobal('document', {
    createElement: (tag: string) => {
      if (tag !== 'canvas') throw new Error('unexpected element: ' + tag);
      return new StubCanvas();
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Charizard, Pikachu, Gengar, Lucario, Garchomp, Mimikyu — six real species,
// two of them dual-typed, one shiny, no nicknames anywhere.
const TEAM: (TeamMember | null)[] = [
  { id: 6, shiny: false }, { id: 25, shiny: true }, { id: 94, shiny: false },
  { id: 448, shiny: false, teraType: 'steel' }, { id: 445, shiny: false }, { id: 778, shiny: false },
];
const TRAINER: TrainerProfile = {
  name: 'Ash K', title: 'Champion', region: 'Kanto', avatarId: 'pikachu',
  favoriteType: 'electric', signaturePokemonId: 6, motto: 'Onward.',
};
const DESIGNS: MerchDesign[] = ['crest', 'roster', 'id-card', 'banner', 'lineup', 'sigil', 'trainer-card'];
const TEE = MERCH_PRODUCTS.find(p => p.id === 'tshirt-bella-3001')!;
const POSTER = MERCH_PRODUCTS.find(p => p.category === 'poster')!;

/** Marks the FIRST canvas the renderer creates as the print surface. */
function trackPrintCanvas() {
  const doc = document as unknown as { createElement: (tag: string) => StubCanvas };
  const original = doc.createElement;
  let first = true;
  doc.createElement = (tag: string) => {
    const c = original(tag);
    if (first) { c.isPrint = true; first = false; }
    return c;
  };
}

function ctxFor(design: MerchDesign, product = TEE) {
  return {
    team: TEAM, trainer: TRAINER, teamName: 'Kanto Classics', code: 'ABC123-XYZ',
    product, design, gymName: 'Empire City Gym', region: 'FLORIDA', badgeText: 'GYM LEADER',
    year: 2026, badgeRegion: 'kanto', badges: ['kanto-boulder', 'kanto-cascade'],
  };
}

const SPECIES_NAMES = new Set(Object.values(POKEMON_BY_ID).map(p => p.display.toUpperCase()));

describe('merch prints never touch official artwork', () => {
  for (const design of DESIGNS) {
    it(`${design}: requests only pixel sprites, never artwork-* or home-*`, async () => {
      trackPrintCanvas();
      await renderMerchDesign(ctxFor(design));
      expect(rec.urls.length).toBeGreaterThan(0);
      const offenders = rec.urls.filter(u => FORBIDDEN_URL.test(u));
      expect(offenders).toEqual([]);
    });

    it(`${design}: never draws a fetched image straight onto the print canvas`, async () => {
      trackPrintCanvas();
      await renderMerchDesign(ctxFor(design));
      // Silhouette masks are canvases; a raw sprite would show up as StubImage.
      expect(rec.drawnOnPrint.filter(n => n === 'StubImage')).toEqual([]);
    });
  }

  it('the preview path follows the same rule (what you see is what prints)', async () => {
    for (const design of DESIGNS) {
      rec.urls.length = 0;
      await renderMerchPreview(ctxFor(design, POSTER));
      expect(rec.urls.filter(u => FORBIDDEN_URL.test(u))).toEqual([]);
    }
  });

  it('full-bleed products follow the same rule', async () => {
    for (const design of DESIGNS) {
      rec.urls.length = 0;
      await renderMerchDesign(ctxFor(design, POSTER));
      expect(rec.urls.filter(u => FORBIDDEN_URL.test(u))).toEqual([]);
    }
  });

  it('degrades to a glyph when every sprite fails — the print still renders (gotcha 11)', async () => {
    StubImage.failing = /.*/;
    trackPrintCanvas();
    for (const design of DESIGNS) {
      const blob = await renderMerchDesign(ctxFor(design));
      expect(blob.size).toBeGreaterThan(0);
    }
    // The failure path must not go hunting for the artwork variants either.
    expect(rec.urls.filter(u => FORBIDDEN_URL.test(u))).toEqual([]);
    expect(rec.drawnOnPrint.filter(n => n === 'StubImage')).toEqual([]);
  });
});

describe('merch prints never auto-print a species name', () => {
  for (const design of DESIGNS) {
    it(`${design}: with no nicknames set, no text drawn is a species display name`, async () => {
      await renderMerchDesign(ctxFor(design));
      expect(rec.fillText.length).toBeGreaterThan(0);
      const offenders = rec.fillText
        .map(t => t.toUpperCase().replace(/[…]/g, ''))
        .filter(t => SPECIES_NAMES.has(t));
      expect(offenders).toEqual([]);
    });
  }

  it('a nickname the user typed IS printed — it is their text, not ours', async () => {
    const team = TEAM.map((m, i) => (m && i === 0 ? { ...m, nickname: 'Blaze' } : m));
    await renderMerchDesign({ ...ctxFor('roster'), team });
    expect(rec.fillText.some(t => t === 'BLAZE')).toBe(true);
  });

  it('every shipped design id renders', () => {
    for (const d of MERCH_DESIGNS) expect(DESIGNS).toContain(d.id);
  });
});
