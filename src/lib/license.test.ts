// Premium entitlement on boot.
//
// Audit A-1 / C-4: `?unlock=premium` shipped live as a one-line, shareable
// premium bypass because applyOwnerUnlock() never asked whether a Worker (i.e.
// a real store) was configured. These tests pin the contract: with a worker,
// the preview path is inert and the ONLY entitlement is a verified license;
// without one, the preview toggle the offline bundle and the browser suite rely
// on keeps working.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyOwnerUnlock, consumeCheckoutCancel, consumeMerchReturn, hasOwnerUnlock,
  isWorkerConfigured, PREVIEW_PREMIUM_KEY, LICENSE_KEY,
} from './license';

// jsdom isn't configured for this project — provide the two browser globals
// the module reads: a real Map behind localStorage and a mutable location.
function installBrowser(opts: { worker: boolean; search?: string; hash?: string }) {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
  });
  const location = { search: opts.search ?? '', hash: opts.hash ?? '', pathname: '/' };
  const replaced: string[] = [];
  vi.stubGlobal('window', {
    TRAINERS_CODEX_CONFIG: opts.worker ? { worker: { url: 'https://api.example.test' } } : undefined,
    location,
    history: { replaceState: (_s: unknown, _t: string, url: string) => { replaced.push(url); } },
  });
  return { store, replaced };
}

afterEach(() => vi.unstubAllGlobals());

describe('applyOwnerUnlock with a worker configured (production)', () => {
  it('reports the worker', () => {
    installBrowser({ worker: true });
    expect(isWorkerConfigured()).toBe(true);
  });

  it('?unlock=premium grants nothing, strips the param, and sets no flag', () => {
    const { store, replaced } = installBrowser({ worker: true, search: '?unlock=premium' });
    expect(applyOwnerUnlock()).toBeNull();
    expect(store.has(PREVIEW_PREMIUM_KEY)).toBe(false);
    expect(hasOwnerUnlock()).toBe(false);
    expect(replaced).toEqual(['/']);
  });

  it('#unlock=premium and every other directive value are equally inert', () => {
    for (const hash of ['#unlock=premium', '#unlock=1', '#unlock=pro', '#team=abc&unlock=on']) {
      const { store } = installBrowser({ worker: true, hash });
      expect(applyOwnerUnlock()).toBeNull();
      expect(store.has(PREVIEW_PREMIUM_KEY)).toBe(false);
    }
  });

  it('purges a preview flag left over from a static build — it is not an entitlement here', () => {
    const { store } = installBrowser({ worker: true });
    store.set(PREVIEW_PREMIUM_KEY, 'true');
    expect(hasOwnerUnlock()).toBe(false);
    expect(applyOwnerUnlock()).toBeNull();
    expect(store.has(PREVIEW_PREMIUM_KEY)).toBe(false);
  });

  it('leaves a stored license alone (that is the real entitlement)', () => {
    const { store } = installBrowser({ worker: true, search: '?unlock=premium' });
    store.set(LICENSE_KEY, 'h.b.s');
    applyOwnerUnlock();
    expect(store.get(LICENSE_KEY)).toBe('h.b.s');
  });

  it('touches nothing when no directive is present', () => {
    const { replaced } = installBrowser({ worker: true, search: '?seed=8843' });
    expect(applyOwnerUnlock()).toBeNull();
    expect(replaced).toEqual([]);
  });
});

describe('applyOwnerUnlock without a worker (offline / static bundle)', () => {
  it('?unlock=premium turns the preview flag on and strips the param', () => {
    const { store, replaced } = installBrowser({ worker: false, search: '?unlock=premium&seed=8843' });
    expect(applyOwnerUnlock()).toBe('unlocked');
    expect(store.get(PREVIEW_PREMIUM_KEY)).toBe('true');
    expect(hasOwnerUnlock()).toBe(true);
    expect(replaced).toEqual(['/?seed=8843']);
  });

  it('unlock=off clears the flag and any license', () => {
    const { store } = installBrowser({ worker: false, search: '?unlock=off' });
    store.set(PREVIEW_PREMIUM_KEY, 'true');
    store.set(LICENSE_KEY, 'h.b.s');
    expect(applyOwnerUnlock()).toBe('locked');
    expect(store.has(PREVIEW_PREMIUM_KEY)).toBe(false);
    expect(store.has(LICENSE_KEY)).toBe(false);
  });

  it('a stored preview flag is honoured on boot', () => {
    const { store } = installBrowser({ worker: false });
    store.set(PREVIEW_PREMIUM_KEY, 'true');
    expect(hasOwnerUnlock()).toBe(true);
  });
});

describe('checkout return params (A-6)', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('?checkout=cancel is consumed: reports premium, strips checkout + session_id', () => {
    const { replaced } = installBrowser({ worker: true, search: '?checkout=cancel&session_id=cs_test_x&seed=1' });
    expect(consumeCheckoutCancel()).toBe('premium');
    expect(replaced).toEqual(['/?seed=1']);
  });

  it('?credits=cancel is consumed as the credits flow', () => {
    const { replaced } = installBrowser({ worker: true, search: '?credits=cancel&session_id=cs_test_x' });
    expect(consumeCheckoutCancel()).toBe('credits');
    expect(replaced).toEqual(['/']);
  });

  it('leaves ?checkout=success alone for bootstrapFromCheckoutReturn', () => {
    const { replaced } = installBrowser({ worker: true, search: '?checkout=success&session_id=cs_test_x' });
    expect(consumeCheckoutCancel()).toBeNull();
    expect(replaced).toEqual([]);
  });

  it('does not consume a merch return, and merch still handles its own', () => {
    installBrowser({ worker: true, search: '?merch=cancel&session_id=cs_test_x' });
    expect(consumeCheckoutCancel()).toBeNull();
    expect(consumeMerchReturn()).toBe('cancel');
  });
});
