import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadStorage, sanitizeMember, sanitizeMembers, sanitizeName, sanitizeTeam, sanitizeTrainer,
  MAX_NAME_LENGTH, MAX_FIELD_LENGTH,
} from './storage';
import { STORAGE_KEY, TYPES, NATURES } from './constants';
import { MOVES_LIST } from './pokemon';

// vitest runs in node: give loadStorage a minimal localStorage.
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  } as Storage;
});

const MOVE_A = MOVES_LIST[0].id;
const MOVE_B = MOVES_LIST[1].id;

// Every wrong type a JSON payload can carry for a field.
const JUNK: unknown[] = [
  undefined, null, 0, 1, -1, 1.5, NaN, Infinity, '', 'x', 'a'.repeat(500),
  true, false, [], [1, 'x', null], {}, { a: 1 }, () => 1,
];

describe('sanitizeMember', () => {
  it('drops anything that is not an object with a dex id', () => {
    for (const j of JUNK) expect(sanitizeMember(j)).toBeNull();
    expect(sanitizeMember({ id: 'abc' })).toBeNull();
    expect(sanitizeMember({ id: 999999 })).toBeNull();
    expect(sanitizeMember({ id: -3 })).toBeNull();
    expect(sanitizeMember({ id: NaN })).toBeNull();
  });

  it('keeps a valid id with every optional field of the wrong type stripped', () => {
    for (const j of JUNK) {
      const m = sanitizeMember({
        id: 25, shiny: j, nickname: j, ability: j, heldItem: j, moves: j,
        sprite: j, teraType: j, nature: j, evs: j, ivs: j,
      });
      expect(m).not.toBeNull();
      expect(m!.id).toBe(25);
      expect(typeof m!.shiny).toBe('boolean');
      for (const k of ['nickname', 'ability', 'heldItem'] as const) {
        if (m![k] !== undefined) {
          expect(typeof m![k]).toBe('string');
          expect(m![k]!.length).toBeLessThanOrEqual(MAX_FIELD_LENGTH);
        }
      }
      if (m!.moves !== undefined) {
        expect(Array.isArray(m!.moves)).toBe(true);
        expect(m!.moves.length).toBeLessThanOrEqual(4);
        for (const mid of m!.moves) expect(typeof mid).toBe('number');
      }
      if (m!.teraType !== undefined) expect(TYPES).toContain(m!.teraType);
      if (m!.nature !== undefined) expect(NATURES).toContain(m!.nature);
      if (m!.evs !== undefined) for (const v of Object.values(m!.evs)) expect(typeof v).toBe('number');
    }
  });

  it('keeps well-typed fields verbatim', () => {
    const m = sanitizeMember({
      id: 6, shiny: true, nickname: 'Zard', ability: 'Blaze', heldItem: 'Leftovers',
      moves: [MOVE_A, MOVE_B], sprite: 'home-shiny', teraType: 'fire', nature: 'Timid',
      evs: { spa: 252, spe: 252, hp: 4 }, ivs: { atk: 0 },
    });
    expect(m).toEqual({
      id: 6, shiny: true, nickname: 'Zard', ability: 'Blaze', heldItem: 'Leftovers',
      moves: [MOVE_A, MOVE_B], sprite: 'home-shiny', teraType: 'fire', nature: 'Timid',
      evs: { spa: 252, spe: 252, hp: 4 }, ivs: { atk: 0 },
    });
  });

  it('filters unknown and non-numeric move ids and caps at four', () => {
    const m = sanitizeMember({ id: 6, moves: [999999, 'x', null, MOVE_A, MOVE_B, MOVE_A, MOVE_B, MOVE_A] });
    expect(m!.moves).toEqual([MOVE_A, MOVE_B, MOVE_A, MOVE_B]);
    // the exact shape from the crash report
    expect(sanitizeMember({ id: 25, shiny: false, moves: 'x' })!.moves).toBeUndefined();
  });

  it('clamps spreads to legal ranges', () => {
    const m = sanitizeMember({ id: 6, evs: { hp: 9999, atk: -5, spe: 'x' }, ivs: { hp: 40 } });
    expect(m!.evs).toEqual({ hp: 252, atk: 0 });
    expect(m!.ivs).toEqual({ hp: 31 });
  });
});

describe('sanitizeMembers / sanitizeTeam / sanitizeName', () => {
  it('always yields exactly six slots', () => {
    for (const j of JUNK) {
      const ms = sanitizeMembers(j);
      expect(ms).toHaveLength(6);
      for (const m of ms) expect(m === null || typeof m.id === 'number').toBe(true);
    }
    expect(sanitizeMembers(Array(12).fill({ id: 25 }))).toHaveLength(6);
  });

  it('names are strings, trimmed and capped', () => {
    for (const j of JUNK) {
      const n = sanitizeName(j);
      expect(typeof n).toBe('string');
      expect(n.length).toBeLessThanOrEqual(MAX_NAME_LENGTH);
    }
    expect(sanitizeName({ o: 1 })).toBe('');
    expect(sanitizeName('  hi  ')).toBe('hi');
  });

  it('coerces a team with junk everywhere into a well-typed SavedTeam', () => {
    const t = sanitizeTeam({ id: 7, name: { o: 1 }, members: ['garbage', 7, { id: 'abc' }, { id: 999999, shiny: 'yes' }, { id: 25, moves: 'x', nickname: { a: 1 }, teraType: 'lava', ability: 9 }, { id: 6, moves: [999999, 'x', null] }], createdAt: 'x', notes: 5 });
    expect(t).not.toBeNull();
    expect(typeof t!.id).toBe('string');
    expect(t!.name).toBe('Untitled');
    expect(typeof t!.createdAt).toBe('number');
    expect(t!.notes).toBeUndefined();
    expect(t!.members.map(m => m?.id ?? null)).toEqual([null, null, null, null, 25, 6]);
    expect(t!.members[4]).toEqual({ id: 25, shiny: false });
  });

  it('migrates a legacy ids team', () => {
    const t = sanitizeTeam({ id: 'L', name: 'old', ids: [1, 4, 7, null, 'x', 999999], createdAt: 5 });
    expect(t!.members.map(m => m?.id ?? null)).toEqual([1, 4, 7, null, null, null]);
  });

  it('rejects non-objects', () => {
    for (const j of JUNK) if (typeof j !== 'object' || j === null || Array.isArray(j)) expect(sanitizeTeam(j)).toBeNull();
  });
});

describe('sanitizeTrainer', () => {
  it('needs a string name, strips everything else that is mistyped', () => {
    expect(sanitizeTrainer({ name: { x: 1 }, title: 5 })).toBeNull();
    for (const j of JUNK) {
      const t = sanitizeTrainer({ name: 'T', title: j, region: j, avatarId: j, customAvatarDataUrl: j, catchphrase: j, favoriteType: j, signaturePokemonId: j, motto: j });
      expect(t).not.toBeNull();
      expect(t!.name).toBe('T');
      for (const k of ['title', 'region', 'avatarId', 'catchphrase', 'motto', 'customAvatarDataUrl'] as const) {
        if (t![k] !== undefined) expect(typeof t![k]).toBe('string');
      }
      if (t!.favoriteType !== undefined) expect(TYPES).toContain(t!.favoriteType);
      if (t!.signaturePokemonId !== undefined) expect(typeof t!.signaturePokemonId).toBe('number');
    }
    expect(sanitizeTrainer({ name: 'T', favoriteType: 'lava', signaturePokemonId: 'x', avatarId: 12345 })).toEqual({ name: 'T' });
    expect(sanitizeTrainer({ name: 'T', customAvatarDataUrl: 'javascript:alert(1)' })!.customAvatarDataUrl).toBeUndefined();
    expect(sanitizeTrainer({ name: 'T', customAvatarDataUrl: 'data:image/webp;base64,AA' })!.customAvatarDataUrl).toBe('data:image/webp;base64,AA');
  });
});

describe('loadStorage', () => {
  const nameObject = { teams: [{ id: 'a', name: { o: 1 }, members: [{ id: 25, shiny: false }, null, null, null, null, null], createdAt: 1 }], current: { members: [{ id: 25, shiny: false }, null, null, null, null, null], name: { o: 1 } }, trainer: { name: { x: 1 }, title: 5, region: ['a'], motto: { m: 1 } } };
  const memberJunk = { teams: [{ id: 'b', name: 'junk', members: ['garbage', 7, { id: 'abc' }, { id: 999999, shiny: 'yes' }, { id: 25, moves: 'x', nickname: { a: 1 }, teraType: 'lava', ability: 9 }, { id: 6, moves: [999999, 'x', null] }], createdAt: 'x' }], current: { members: ['garbage', 7, { id: 'abc' }, { id: 999999 }, { id: 25, moves: 'x', nickname: { a: 1 }, teraType: 'lava' }, { id: 6, moves: [999999, 'x', null], evs: 'no', nature: 'Zzz' }], name: 'junk' }, trainer: { name: 'T', favoriteType: 'lava', signaturePokemonId: 'x', avatarId: 12345 } };

  it('returns only well-typed state for the payloads that used to crash boot', () => {
    for (const payload of [nameObject, memberJunk]) {
      store.set(STORAGE_KEY, JSON.stringify(payload));
      const s = loadStorage();
      expect(typeof s.current!.name).toBe('string');
      expect(s.current!.members).toHaveLength(6);
      for (const m of s.current!.members) {
        if (!m) continue;
        expect(typeof m.id).toBe('number');
        if (m.moves) expect(Array.isArray(m.moves)).toBe(true);
      }
      for (const t of s.teams) {
        expect(typeof t.name).toBe('string');
        expect(t.members).toHaveLength(6);
      }
      if (s.trainer) expect(typeof s.trainer.name).toBe('string');
    }
    store.set(STORAGE_KEY, JSON.stringify(nameObject));
    expect(loadStorage().trainer).toBeNull();
    store.set(STORAGE_KEY, JSON.stringify(memberJunk));
    expect(loadStorage().current!.members[4]).toEqual({ id: 25, shiny: false });
  });

  it('survives every top-level shape', () => {
    for (const j of [...JUNK, { teams: 'nope', current: 'str', trainer: 'str', favorites: { a: 1 } }, { current: { members: 'x' } }, { current: { ids: 'x' } }]) {
      store.set(STORAGE_KEY, JSON.stringify(j) ?? 'undefined');
      const s = loadStorage();
      expect(Array.isArray(s.teams)).toBe(true);
      expect(s.current === null || Array.isArray(s.current.members)).toBe(true);
      expect(Array.isArray(s.favorites)).toBe(true);
    }
  });

  it('keeps a legitimate payload intact', () => {
    const good = { teams: [{ id: 't1', name: 'Rain', members: [{ id: 186, shiny: true, moves: [MOVE_A] }, null, null, null, null, null], createdAt: 12 }], current: { members: [{ id: 25, shiny: false }, null, null, null, null, null], name: 'cur' }, trainer: { name: 'Ash', title: 'Champion', favoriteType: 'electric' }, premium: true, favorites: [25, 6, 'x', 1.5] };
    store.set(STORAGE_KEY, JSON.stringify(good));
    const s = loadStorage();
    expect(s.teams[0]).toEqual(good.teams[0]);
    expect(s.current).toEqual(good.current);
    expect(s.trainer).toEqual(good.trainer);
    expect(s.premium).toBe(true);
    expect(s.favorites).toEqual([25, 6, 1.5]);
  });
});
