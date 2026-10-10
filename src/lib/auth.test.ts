// Auth toast gating (audit A-2).
//
// Supabase's onAuthStateChange replays INITIAL_SESSION on every boot — with a
// null session for every anonymous visitor. The shell used to toast "signed
// out" on any null callback, so the live site greeted every first-time visitor
// with a sign-out notice. Only a real SIGNED_OUT transition qualifies.

import { describe, expect, it } from 'vitest';
import { isSignOutTransition, type AuthSession } from './auth';

const alice: AuthSession = { userId: 'u1', email: 'a@example.test', name: 'Alice', avatarUrl: null, provider: 'google' };

describe('isSignOutTransition', () => {
  it('is false for the anonymous INITIAL_SESSION replay', () => {
    expect(isSignOutTransition(null, 'INITIAL_SESSION', null)).toBe(false);
  });

  it('is false for a signed-in INITIAL_SESSION and for SIGNED_IN', () => {
    expect(isSignOutTransition(null, 'INITIAL_SESSION', alice)).toBe(false);
    expect(isSignOutTransition(null, 'SIGNED_IN', alice)).toBe(false);
  });

  it('is false for token refreshes and user updates while signed in', () => {
    expect(isSignOutTransition(alice, 'TOKEN_REFRESHED', alice)).toBe(false);
    expect(isSignOutTransition(alice, 'USER_UPDATED', alice)).toBe(false);
  });

  it('is true only when a live session ends with SIGNED_OUT', () => {
    expect(isSignOutTransition(alice, 'SIGNED_OUT', null)).toBe(true);
  });

  it('is false for a SIGNED_OUT with no prior session (stale tab, duplicate event)', () => {
    expect(isSignOutTransition(null, 'SIGNED_OUT', null)).toBe(false);
  });
});
