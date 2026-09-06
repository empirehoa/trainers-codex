import { appendFileSync } from 'node:fs';
const LOG='/tmp/claude-0/-home-user-trainers-codex/d0fce66e-a9e8-5263-973d-d5dbf13423f1/scratchpad/out.log';
const log=(...a)=>appendFileSync(LOG, a.map(x=>typeof x==='string'?x:JSON.stringify(x)).join(' ')+'\n');
import { it } from 'vitest';
import { simulate, simulateWithStrategy, chapterCountFor, phaseFor, decisionChapterIndices } from '@/journey/engine';
import { matchupFor, gymLeaders, eliteFour, regionChampion, syndicateFor } from '@/journey/opponents';
import { buildShareCode, parseShareCode } from '@/lib/analysis';
import { stakeTarget, CAMPAIGNS } from '@/journey/campaign';
import { ARCHETYPES, PACES, DECISION_CARDS, VERDICTS } from '@/journey/content';
import { POKEMON_BY_ID } from '@/lib/pokemon';

const setupOf = (seed, extra = {}) => ({ seed, trainerName: 'P', regionId: 'kanto', starterId: 4, archetype: 'balance', pace: 'normal', source: 'fresh', ...extra });

function playFull(setup, choose, actions = []) {
  const choices = [];
  for (let i = 0; i < 400; i++) {
    const s = simulate(setup, choices, actions);
    if (s.status === 'complete') return s.run;
    const d = s.decision;
    choices.push({ chapterIndex: d.chapterIndex, cardId: d.card.id, optionId: choose(d) });
  }
  throw new Error('no terminate');
}

it('1. share code drops forms', () => {
  const code = buildShareCode([{ id: 10034, shiny: false }, { id: 9, shiny: true }, { id: 3, shiny: false }, { id: 10100, shiny: false }, null, null]);
  log('code', code, '→', JSON.stringify(parseShareCode(code)));
  log('10034 in dataset?', !!POKEMON_BY_ID[10034], POKEMON_BY_ID[10034]?.display, '| 10100', POKEMON_BY_ID[10100]?.display);
});

it('2. matchup immunity / resistance dead branches', () => {
  const opp = (specialty) => ({ kind: 'gym', name: 'X', title: 'T', specialty, index: 1, level: 30, teamIds: [], regionId: 'kanto' });
  const mem = (id) => ({ id, shiny: false, origin: 'wild', joinedAt: 0, types: POKEMON_BY_ID[id].types, evolved: 0, xp: 0 });
  log('Skarmory(steel/flying) vs ground:', JSON.stringify(matchupFor([mem(227)], opp('ground'), 30)));
  log('Gengar(ghost/poison) vs normal:', JSON.stringify(matchupFor([mem(94)], opp('normal'), 30)));
  log('Volcanion(fire/water) vs grass:', JSON.stringify(matchupFor([mem(721)], opp('grass'), 30)));
  log('Charizard(fire/flying) vs ground (immune):', JSON.stringify(matchupFor([mem(6)], opp('ground'), 30)));
  log('Blastoise(water) vs fire (resists):', JSON.stringify(matchupFor([mem(9)], opp('fire'), 30)));
  // Exhaustive: does any mono-member roster ever produce negative offense credit (off<=0.5) or positive defense credit (def<=0.5)?
  const TYPES = ['normal','fire','water','electric','grass','ice','fighting','poison','ground','flying','psychic','bug','rock','ghost','dragon','dark','steel','fairy'];
  let negOff = 0, posDef = 0, total = 0;
  for (const p of Object.values(POKEMON_BY_ID)) for (const t of TYPES) {
    const m = matchupFor([{ ...mem(p.id), types: p.types }], opp(t), 30); total++;
    // typeScore = (offense+defense)/2 with levelScore=0 → advantage*... derive offense/defense sign combos
    // If resist/immune credit ever fired, some (p,t) with no super-effective either way would have nonzero advantage.
    const anyStrong = m.strongPicks.length > 0, anyWeak = m.weakPicks.length > 0;
    if (!anyStrong && !anyWeak && Math.abs(m.advantage) > 1e-9) { if (m.advantage < 0) negOff++; else posDef++; }
  }
  log(`exhaustive ${total} (species×type) pairs with no SE either way: nonzero advantage from resist/immune credit = ${negOff + posDef}`);
});

it('3. reroll returns the same card', () => {
  let same = 0, n = 0; const byPhase = {};
  for (let seed = 1; seed <= 600; seed++) {
    const setup = setupOf(seed);
    const s0 = simulate(setup, [], []);
    const s1 = simulate(setup, [], [{ type: 'reroll', chapterIndex: 0 }]);
    n++; const ph = s0.chapters.length; 
    if (s0.decision.card.id === s1.decision.card.id) same++;
    // second decision too
    const c = [{ chapterIndex: 0, cardId: s0.decision.card.id, optionId: s0.decision.card.options[0].id }];
    const t0 = simulate(setup, c, []);
    if (t0.status === 'awaiting-decision') {
      const idx = t0.decision.chapterIndex;
      const t1 = simulate(setup, c, [{ type: 'reroll', chapterIndex: idx }]);
      n++; if (t0.decision.card.id === t1.decision.card.id) same++;
      const k = t0.chapters[t0.chapters.length-1]?.phase; byPhase[k] = byPhase[k] || {same:0,n:0}; byPhase[k].n++; if (t0.decision.card.id === t1.decision.card.id) byPhase[k].same++;
    }
  }
  log(`reroll → identical card: ${same}/${n} = ${(100*same/n).toFixed(1)}%`, JSON.stringify(byPhase));
  // cards per phase
  const phases = ['gym-circuit','elite-four','regional','national','worlds','world-cup','veteran'];
  log('cards per phase', phases.map(p => `${p}:${DECISION_CARDS.filter(c=>c.phases.includes(p)).length}`).join(' '));
});

it('4. long campaigns: simulateWithStrategy throws; regions without gyms', () => {
  for (const camp of ['season', 'saga']) {
    const setup = setupOf(7, { campaign: camp, pace: 'intense' });
    try { simulateWithStrategy(setup, d => d.card.options[0].id); log(camp, 'strategy ok'); }
    catch (e) { log(camp, 'intense → simulateWithStrategy THROWS:', e.message, 'chapters', chapterCountFor(setup), 'decisions', decisionChapterIndices(setup).length); }
  }
  for (const camp of ['season', 'saga']) {
    const agg = { regionsWithGym: 0, regionsTotal: 0, crownRegions: 0, runs: 0, travelOffered: 0, wcVsNonChampion: 0, e4Regions: 0 };
    for (let seed = 1; seed <= 40; seed++) {
      const setup = setupOf(seed, { campaign: camp, pace: 'normal' });
      const run = playFull(setup, d => d.card.options[0].id);
      agg.runs++;
      const regions = new Set(run.region.tour);
      agg.regionsTotal += regions.size;
      const gymRegions = new Set(run.battles.filter(b => b.kind === 'gym').map(b => run.chapters[b.chapterIndex] && b.chapterIndex).map(ci => ci));
      // region per chapter
      const regionOfChapter = {};
      // rebuild via regionAt is internal; approximate by badges list regionIds + crowns
      const badgeRegions = new Set(run.badges.map(b => b.regionId));
      agg.regionsWithGym += badgeRegions.size;
      agg.crownRegions += run.crowns.length;
      const phases = {};
      for (const ch of run.chapters) phases[ch.phase] = (phases[ch.phase] || 0) + 1;
      if (seed === 1) log(camp, 'seed1 chapters', run.chapterCount, 'phase counts', JSON.stringify(phases), 'badges by region', JSON.stringify([...badgeRegions]), 'tour', run.region.tour.join(','), 'stakes', JSON.stringify(run.stakes.map(s => [s.ante, s.target, s.banked, s.cleared])));
    }
    log(camp, `runs ${agg.runs}: avg regions/tour ${(agg.regionsTotal/agg.runs).toFixed(1)}, avg regions with ≥1 badge ${(agg.regionsWithGym/agg.runs).toFixed(2)}, avg crowns ${(agg.crownRegions/agg.runs).toFixed(2)}`);
  }
  log('stake targets 1..9', Array.from({length:9},(_,i)=>stakeTarget(i+1)).join(','));
});

it('5. world cup: who do you actually fight', () => {
  let runs = 0, wcBattles = 0, wcRunsWithBattle = 0, nonChamp = 0, multi = 0, syndicate = 0, champAfterCrown = 0, rematchFlags = 0, dupNames = 0;
  for (let seed = 1; seed <= 600; seed++) for (const a of ['balance', 'aggro']) {
    const run = playFull(setupOf(seed, { archetype: a }), d => d.card.options[0].id);
    runs++;
    const wc = run.battles.filter(b => b.kind === 'world-cup');
    wcBattles += wc.length; if (wc.length) wcRunsWithBattle++; if (wc.length > 1) multi++;
    nonChamp += wc.filter(b => !b.title.startsWith('Region Champion')).length;
    syndicate += run.battles.filter(b => b.kind === 'syndicate').length;
    const crownIdx = run.crowns[0]?.chapterIndex;
    if (crownIdx !== undefined) champAfterCrown += run.battles.filter(b => b.kind === 'champion' && b.chapterIndex > crownIdx).length;
    rematchFlags += run.battles.filter(b => b.rematch).length;
  }
  log(`short runs=${runs}: world-cup battles total ${wcBattles}, runs with ≥1 WC battle ${wcRunsWithBattle}, runs with >1 ${multi}, WC battles vs someone other than own region champion: ${nonChamp}`);
  log(`syndicate battles per run ${(syndicate/runs).toFixed(2)}; champion fights AFTER already crowned: ${champAfterCrown} (${(champAfterCrown/runs).toFixed(2)}/run); rematch flags/run ${(rematchFlags/runs).toFixed(2)}`);
  // name collisions among distinct opponents in one region
  let coll = 0;
  for (let seed = 1; seed <= 3000; seed++) {
    const names = [...gymLeaders(seed, 'kanto'), ...eliteFour(seed, 'kanto'), regionChampion(seed, 'kanto')].map(o => o.name);
    if (new Set(names).size !== names.length) coll++;
  }
  log(`seeds where two DIFFERENT kanto opponents share a full name: ${coll}/3000 = ${(coll/30).toFixed(1)}%`);
});

it('6. how much do choices matter', () => {
  const riskOf = (d, hi) => { const opts = [...d.card.options].sort((a, b) => (a.riskMultiplier ?? 1) - (b.riskMultiplier ?? 1)); return (hi ? opts[opts.length-1] : opts[0]).id; };
  const strategies = { first: d => d.card.options[0].id, last: d => d.card.options[d.card.options.length-1].id, maxRisk: d => riskOf(d, true), minRisk: d => riskOf(d, false) };
  for (const a of ARCHETYPES) {
    const scores = { first: [], last: [], maxRisk: [], minRisk: [] }; let verdictDiff = 0, n = 0, maxSpread = 0, spreadSum = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const runs = Object.fromEntries(Object.entries(strategies).map(([k, f]) => [k, playFull(setupOf(seed, { archetype: a }), f)]));
      for (const k in runs) scores[k].push(runs[k].score);
      const ss = Object.values(runs).map(r => r.score); const spread = Math.max(...ss) - Math.min(...ss); spreadSum += spread; maxSpread = Math.max(maxSpread, spread);
      if (new Set(Object.values(runs).map(r => r.verdict.id)).size > 1) verdictDiff++; n++;
    }
    const sd = xs => { const m = xs.reduce((a,b)=>a+b,0)/xs.length; return Math.sqrt(xs.reduce((a,b)=>a+(b-m)**2,0)/xs.length); };
    const mean = xs => (xs.reduce((a,b)=>a+b,0)/xs.length).toFixed(0);
    log(`${a}: seed-to-seed SD (first)=${sd(scores.first).toFixed(0)} | mean by strategy first=${mean(scores.first)} last=${mean(scores.last)} maxRisk=${mean(scores.maxRisk)} minRisk=${mean(scores.minRisk)} | mean spread across 4 strategies on SAME seed=${(spreadSum/n).toFixed(0)} (max ${maxSpread}) | verdict differs across strategies in ${(100*verdictDiff/n).toFixed(0)}% of seeds`);
  }
});

it('7. phase coverage per chapter count and card shape', () => {
  const missing = [];
  for (let N = 12; N <= 170; N++) {
    const set = new Set(); for (let i = 0; i < N; i++) set.add(phaseFor(i, N));
    if (set.size !== 8) missing.push(`${N}:${8 - set.size}`);
  }
  log('chapterCounts missing a phase:', missing.join(' ') || 'none');
  // card option shape: is option A always the +fame +fatigue risky one?
  let shaped = 0;
  for (const c of DECISION_CARDS) {
    const hi = c.options.reduce((a, b) => ((b.riskMultiplier ?? 1) > (a.riskMultiplier ?? 1) ? b : a));
    const lo = c.options.reduce((a, b) => ((b.riskMultiplier ?? 1) < (a.riskMultiplier ?? 1) ? b : a));
    const hiFameOrFat = (hi.delta.fame ?? 0) > 0 || (hi.delta.fatigue ?? 0) > 0;
    const loBondOrRest = (lo.delta.bond ?? 0) > 0 || (lo.delta.fatigue ?? 0) < 0;
    if (hiFameOrFat && loBondOrRest) shaped++;
  }
  log(`cards where the risky option = +fame/+fatigue and the safe option = +bond/-fatigue: ${shaped}/${DECISION_CARDS.length}`);
  const keys = new Set(); for (const c of DECISION_CARDS) for (const o of c.options) for (const k of Object.keys(o.delta)) keys.add(k);
  log('stat keys any card touches:', [...keys].join(','));
});
