import { describe, it, expect } from 'vitest';
import {
  CHAMPIONS_PRESET_ID, CHAMPIONS_REGULATION, CHAMPIONS_USABLE_IDS, formatRegulationWindow,
  isUsableInChampions, regulationNote, regulationStatus, shortRegulationLabel,
} from './champions';
import { FORMAT_PRESETS, checkLegality, filterLegal, isUnrestricted, presetById, teamLegality } from './formats';
import { POKEMON_BY_ID } from './pokemon';
import type { Pokemon } from './types';

const ALL = Object.values(POKEMON_BY_ID) as Pokemon[];
const byName = (n: string) => {
  const p = ALL.find(x => x.name === n);
  if (!p) throw new Error(`no entry ${n}`);
  return p;
};
const preset = presetById(CHAMPIONS_PRESET_ID);

describe('champions-regulation.json', () => {
  it('describes the current Regulation with a dated window and a source', () => {
    expect(CHAMPIONS_REGULATION.id).toBe('m-c');
    expect(CHAMPIONS_REGULATION.label).toBe('Regulation M-C');
    expect(CHAMPIONS_REGULATION.start).toBe('2026-09-09');
    expect(CHAMPIONS_REGULATION.end).toBe('2026-12-02');
    expect(CHAMPIONS_REGULATION.source).toMatch(/^https:\/\/www\.serebii\.net\//);
    expect(CHAMPIONS_REGULATION.fetched).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(CHAMPIONS_REGULATION.seasons.map(s => s.id)).toEqual(['m-6', 'm-7']);
  });

  it('lists ids that exist, sorted and unique, with no Gigantamax or Eternamax form', () => {
    const ids = CHAMPIONS_REGULATION.ids;
    expect(ids.length).toBe(346); // 230 species + 116 forms (82 Megas) — update with the generator's report
    for (let i = 0; i < ids.length; i++) {
      const p = POKEMON_BY_ID[ids[i]];
      expect(p, `id ${ids[i]} is not in the dataset`).toBeDefined();
      if (i) expect(ids[i], 'ids must be strictly increasing').toBeGreaterThan(ids[i - 1]);
      expect(p.form, p.name).not.toBe('gigantamax');
      expect(p.form, p.name).not.toBe('eternamax');
    }
  });

  it('carries the Megas Champions actually runs, old and new, and none it does not', () => {
    for (const n of ['charizard-mega-x', 'charizard-mega-y', 'lucario-mega', 'lucario-mega-z', 'garchomp-mega-z',
      'absol-mega-z', 'raichu-mega-x', 'raichu-mega-y', 'baxcalibur-mega', 'golisopod-mega', 'meganium-mega']) {
      expect(isUsableInChampions(byName(n).id), n).toBe(true);
    }
    // Legends Z-A Megas with no Champions release (and no published ability).
    for (const n of ['zygarde-mega', 'heatran-mega', 'darkrai-mega', 'zeraora-mega', 'magearna-mega', 'tatsugiri-curly-mega']) {
      expect(isUsableInChampions(byName(n).id), n).toBe(false);
    }
    // Mega Rayquaza / the Primals: restricted legendaries are not in the game.
    for (const n of ['rayquaza-mega', 'kyogre-primal', 'groudon-primal', 'mewtwo-mega-x']) {
      expect(isUsableInChampions(byName(n).id), n).toBe(false);
    }
  });

  it('resolves Serebii form rows to our form entries, not just the species', () => {
    for (const n of ['raichu-alola', 'slowbro-galar', 'arcanine-hisui', 'tauros-paldea-combat-breed',
      'tauros-paldea-blaze-breed', 'tauros-paldea-aqua-breed', 'rotom-wash', 'lycanroc-dusk',
      'toxtricity-low-key', 'indeedee-female', 'floette-eternal', 'squawkabilly-blue-plumage']) {
      expect(isUsableInChampions(byName(n).id), n).toBe(true);
    }
    // Eternal Flower Floette is in; ordinary Floette is not.
    expect(isUsableInChampions(byName('floette').id)).toBe(false);
  });

  it('every usable form other than Floette has its base species usable too', () => {
    for (const id of CHAMPIONS_REGULATION.ids) {
      const p = POKEMON_BY_ID[id];
      if (p.baseSpeciesId === undefined || p.baseSpeciesId === 670) continue;
      expect(CHAMPIONS_USABLE_IDS.has(p.baseSpeciesId), `${p.name} without its base`).toBe(true);
    }
  });
});

describe('regulationStatus', () => {
  const reg = CHAMPIONS_REGULATION;
  it('is upcoming before the start, active inside the window, ended on the end date', () => {
    expect(regulationStatus(reg, new Date('2026-09-08T23:59:59Z')).phase).toBe('upcoming');
    expect(regulationStatus(reg, new Date('2026-09-09T00:00:00Z')).phase).toBe('active');
    expect(regulationStatus(reg, new Date('2026-10-10T12:00:00Z')).phase).toBe('active');
    expect(regulationStatus(reg, new Date('2026-12-01T23:59:59Z')).phase).toBe('active');
    expect(regulationStatus(reg, new Date('2026-12-02T00:00:00Z')).phase).toBe('ended');
  });

  it('counts whole days left and finds the season', () => {
    const s = regulationStatus(reg, new Date('2026-10-10T12:00:00Z'));
    expect(s.daysLeft).toBe(53);
    expect(s.season?.id).toBe('m-7');
    expect(regulationStatus(reg, new Date('2026-09-20T00:00:00Z')).season?.id).toBe('m-6');
    expect(regulationStatus(reg, new Date('2026-11-20T00:00:00Z')).season).toBeUndefined();
    expect(regulationStatus(reg, new Date('2026-12-10T00:00:00Z')).daysLeft).toBeLessThan(0);
  });

  it('formats the window and the chip label', () => {
    expect(formatRegulationWindow(reg)).toBe('Sep 9 – Dec 2, 2026');
    expect(shortRegulationLabel(reg)).toBe('Reg. M-C');
    expect(formatRegulationWindow({ ...reg, start: '2026-12-02', end: '2027-03-03' })).toBe('Dec 2, 2026 – Mar 3, 2027');
  });

  it('the panel note says what it is and goes stale loudly', () => {
    expect(regulationNote(reg, new Date('2026-10-10T12:00:00Z')))
      .toBe('Regulation M-C · Sep 9 – Dec 2, 2026 · Season M-7 · 53 days left · 346 usable');
    expect(regulationNote(reg, new Date('2026-12-25T00:00:00Z'))).toMatch(/ended Dec 2, 2026 — a newer regulation is likely live/);
    expect(regulationNote(reg, new Date('2026-08-01T00:00:00Z'))).toMatch(/starts Sep 9/);
  });
});

describe('the Champions format preset', () => {
  it('exists, is an allowlist, and is not "unrestricted"', () => {
    expect(FORMAT_PRESETS.some(p => p.id === CHAMPIONS_PRESET_ID)).toBe(true);
    expect(preset.id).toBe(CHAMPIONS_PRESET_ID);
    expect(preset.label).toBe('Champions · Reg. M-C');
    expect(preset.allowedIds).toBe(CHAMPIONS_REGULATION.ids);
    expect(isUnrestricted(preset)).toBe(false);
    expect(preset.description).toMatch(/Sep 9 – Dec 2, 2026/);
    expect(preset.description).toMatch(/346 species, forms and Megas/);
  });

  it('judges a Pokémon by the roster and names the list in the reason', () => {
    expect(checkLegality(byName('charizard'), preset).legal).toBe(true);
    expect(checkLegality(byName('lucario-mega-z'), preset).legal).toBe(true);
    const mewtwo = checkLegality(byName('mewtwo'), preset);
    expect(mewtwo.legal).toBe(false);
    expect(mewtwo.reasons).toEqual(['not usable in Champions Reg. M-C']);
    expect(checkLegality(byName('zygarde-mega'), preset).legal).toBe(false);
    expect(checkLegality(byName('charizard-gmax'), preset).legal).toBe(false);
  });

  it('rolls up to the team and narrows the pool to exactly the roster', () => {
    const team = [byName('charizard'), byName('mewtwo'), null, byName('rotom-wash')];
    const t = teamLegality(team, preset);
    expect(t.legal).toBe(false);
    expect(t.offenders.map(o => o.p.name)).toEqual(['mewtwo']);
    expect(filterLegal(ALL, preset).length).toBe(CHAMPIONS_REGULATION.ids.length);
  });

  it('leaves every other preset untouched', () => {
    for (const p of FORMAT_PRESETS) {
      if (p.id === CHAMPIONS_PRESET_ID) continue;
      expect(p.allowedIds, p.id).toBeNull();
      // Pikachu stays legal everywhere (tests/test-formats.mjs relies on it);
      // it is on the Champions roster too.
      expect(checkLegality(byName('pikachu'), p).legal, p.id).toBe(true);
    }
    expect(checkLegality(byName('pikachu'), preset).legal).toBe(true);
  });
});
