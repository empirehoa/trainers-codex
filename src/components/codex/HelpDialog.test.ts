// Help / FAQ copy audit (A-8).
//
// The FAQ described premium as a dev "preview-unlock toggle" with a plan that
// "will be $4.99/mo" months after Stripe went live, under a "v5.0" header with a
// "what's new in v4" list. Copy has no type checker; this is it. The component
// source is read as text via Vite's `?raw` so nothing non-component has to be
// exported from the .tsx (react-refresh lint).

import { describe, expect, it } from 'vitest';
import source from './HelpDialog.tsx?raw';

describe('HelpDialog copy', () => {
  it('no longer describes the pre-launch preview model', () => {
    expect(source).not.toMatch(/preview-unlock/i);
    expect(source).not.toMatch(/will be \$4\.99/i);
    expect(source).not.toMatch(/for development/i);
  });

  it('carries no stale version stamps', () => {
    expect(source).not.toMatch(/what's new in v\d/i);
    expect(source).not.toMatch(/codex v\d\.\d/i);
  });

  it('states the shipped premium model: both prices, surfaces-only gating, cancel, restore, terms', () => {
    expect(source).toMatch(/\$4\.99\/month/);
    expect(source).toMatch(/\$39\/year/);
    expect(source).toMatch(/cancel anytime/i);
    expect(source).toMatch(/never gated/i);
    expect(source).toMatch(/restore purchase/i);
    expect(source).toMatch(/legal\.html/);
  });
});
