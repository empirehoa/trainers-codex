import { ChevronRight, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n/useI18n';
import { cn } from '@/lib/utils';
import { PartyRail } from './PartyRail';
import { BadgeTrack } from './BadgeTrack';
import { AreaMap } from './AreaMap';
import { OpponentCard, QuestStrip, CrownStrip, TravelPicker } from './OpponentCard';
import { JourneyPrepare } from './JourneyPrepare';
import type { DecisionOptionSpec, 
  BadgeEarned, CareerStats, DexState, OpponentSummary, PendingDecision,
  PrepareAction, PrepareAvailability, Quest, RegionCrown, RegionProgress,
  RosterEntry, Stake,
} from '@/journey/types';
import type { Opponent } from '@/journey/opponents';
import type { Inventory } from '@/journey/items';

interface Props {
  decision: PendingDecision;
  stats: CareerStats;
  chapterCount: number;
  roster: RosterEntry[];
  dex: DexState;
  badges: BadgeEarned[];
  region: RegionProgress;
  /** Run seed — the area map is generated from it. */
  seed: number;
  stakes: Stake[];
  quests: Quest[];
  crowns: RegionCrown[];
  opponent?: OpponentSummary;
  opponentAdvantage?: number;
  inventory: Inventory;
  prepare: PrepareAvailability;
  actionsThisChapter: number;
  onPick: (optionId: string) => void;
  onAction: (action: PrepareAction) => void;
  onUndoPrep: () => void;
  onUndo: (() => void) | null;
}

export function JourneyDecision({
  decision, stats, chapterCount, roster, dex, badges, region, stakes, quests, seed,
  crowns, opponent, opponentAdvantage, inventory, prepare, actionsThisChapter,
  onPick, onAction, onUndoPrep, onUndo,
}: Props) {
  const { t } = useI18n();
  const { card, vars } = decision;

  return (
    <div className="p-4 space-y-4" data-testid="journey-decision">
      <ProgressHeader
        chapter={decision.chapterIndex + 1}
        total={chapterCount}
        age={stats.age}
      />

      {opponent && (
        <OpponentCard
          opponent={opponent as unknown as Opponent}
          advantage={opponentAdvantage ?? 0}
        />
      )}

      {prepare.travelOptions && prepare.travelOptions.length > 0 && (
        <TravelPicker
          options={prepare.travelOptions}
          onTravel={regionId => onAction({ type: 'travel', chapterIndex: decision.chapterIndex, regionId })}
        />
      )}

      <p className="text-sm leading-relaxed" data-testid="journey-decision-prompt">
        {t(card.promptKey, vars)}
      </p>

      <div className="space-y-2">
        {card.options.map(opt => (
          <button
            key={opt.id}
            onClick={() => onPick(opt.id)}
            data-testid={`journey-option-${opt.id}`}
            data-journey-option="1"
            className={cn(
              'w-full text-left rounded-md border p-3 transition group',
              'border-border hover:border-primary hover:bg-primary/5',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs font-semibold">{t(opt.labelKey, vars)}</span>
              <span className="flex items-center gap-1.5 shrink-0">
                <RiskTag risk={opt.riskMultiplier ?? 1} />
                <ChevronRight size={13} className="text-muted-foreground group-hover:text-primary" />
              </span>
            </div>
            <div className="font-mono text-[10px] text-muted-foreground mt-1">
              {t(opt.flavorKey, vars)}
            </div>
            <Consequences option={opt} />
          </button>
        ))}
      </div>

      {/* Team, road and missions sit BELOW the choice. They used to sit above it,
          which on a 390px phone put the question itself at y≈780 of 844 — the
          player scrolled past the badge track, the map, the party rail and the
          whole prepare panel to find out what they were being asked. */}
      <BadgeTrack badges={badges} region={region} stakes={stakes} />
      <AreaMap seed={seed} region={region} />

      <CrownStrip crowns={crowns} />

      <PartyRail
        roster={roster}
        dex={dex}
        evolvableIds={prepare.evolves.filter(e => e.eligible).map(e => e.fromId)}
      />

      <JourneyPrepare
        chapterIndex={decision.chapterIndex}
        roster={roster}
        prepare={prepare}
        inventory={inventory}
        stats={stats}
        actionsThisChapter={actionsThisChapter}
        onAction={onAction}
        onUndoPrep={onUndoPrep}
      />

      <QuestStrip quests={quests} />

      <StatStrip stats={stats} />

      {onUndo && (
        <Button variant="ghost" size="sm" onClick={onUndo}
                className="font-mono text-[10px] text-muted-foreground hover:text-primary w-full"
                data-testid="journey-undo">
          <Undo2 size={11} className="mr-1.5" />
          {t('journey.sim.undo')}
        </Button>
      )}
    </div>
  );
}

/** steady / risky / gamble — the variance an option buys, in one word. */
function RiskTag({ risk }: { risk: number }) {
  const { t } = useI18n();
  if (risk <= 1) return null;
  const tier = risk >= 1.45 ? 'gamble' : risk >= 1.25 ? 'risky' : 'steady';
  return (
    <span
      data-testid="journey-risk-tag"
      data-risk={tier}
      className={cn(
        'font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border',
        tier === 'gamble' && 'border-rose-500/60 text-rose-500 dark:text-rose-400',
        tier === 'risky' && 'border-amber-500/60 text-amber-600 dark:text-amber-400',
        tier === 'steady' && 'border-border text-muted-foreground',
      )}
    >
      {t(`journey.option.risk.${tier}`)}
    </span>
  );
}

/**
 * What an option does, before you pick it.
 *
 * The delta chips were invisible until now — a player chose between "Take the
 * challenge" and "Train one more season" on flavor text alone, and only the
 * recap revealed that one cost 8 fatigue. Choices you can't read aren't
 * choices. The payoff line is the other half: what a gamble is FOR.
 */
function Consequences({ option }: { option: DecisionOptionSpec }) {
  const { t } = useI18n();
  const chips = (Object.entries(option.delta) as [keyof CareerStats, number][])
    .filter(([, v]) => v !== undefined && v !== 0)
    .map(([k, v]) => ({ k, v, good: k === 'fatigue' ? v < 0 : v > 0 }));
  const payoff = option.payoff;
  const payoffBits: string[] = [];
  if (payoff) {
    if (payoff.money) payoffBits.push(t('journey.payoff.money', { n: payoff.money }));
    if (payoff.item) payoffBits.push(t(`journey.item.${payoff.item}.name`));
    if (payoff.recruit) payoffBits.push(t(`journey.payoff.recruit.${payoff.recruit}`));
    if (payoff.fatigue && payoff.fatigue < 0) payoffBits.push(t('journey.payoff.fatigueRefund'));
    if (payoff.fame) payoffBits.push(`+${payoff.fame} ${t('journey.stat.fame').toLowerCase()}`);
    if (payoff.bond) payoffBits.push(`+${payoff.bond} ${t('journey.stat.bond').toLowerCase()}`);
  }
  if (!chips.length && !payoffBits.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1" data-testid="journey-consequences">
      {chips.map(c => (
        <span key={c.k}
              className={cn('font-mono text-[10px] px-1.5 py-0.5 rounded',
                c.good ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                       : 'bg-rose-500/10 text-rose-600 dark:text-rose-400')}>
          {c.v > 0 ? '+' : ''}{c.v} {t(`journey.stat.${c.k}`).toLowerCase()}
        </span>
      ))}
      {payoffBits.length > 0 && (
        <span className="font-mono text-[10px] text-primary" data-testid="journey-payoff">
          · {t('journey.option.ifLands')}: {payoffBits.join(' · ')}
        </span>
      )}
    </div>
  );
}

export function ProgressHeader({ chapter, total, age }: { chapter: number; total: number; age: number }) {
  const { t } = useI18n();
  const pct = Math.round((chapter / total) * 100);
  return (
    <div>
      <div className="flex items-center justify-between font-mono text-[10px] text-muted-foreground mb-1.5">
        <span data-testid="journey-progress">{t('journey.sim.chapter', { chapter, total })}</span>
        <span>{t('journey.sim.age', { age })}</span>
      </div>
      <div className="h-1 rounded-full overflow-hidden" style={{ background: 'hsl(var(--muted))' }}>
        <div className="h-full bg-primary transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function StatStrip({ stats }: { stats: CareerStats }) {
  const { t } = useI18n();
  const battles = stats.wins + stats.losses;
  const winPct = battles > 0 ? Math.round((stats.wins / battles) * 100) : 0;

  const cells: [string, string][] = [
    [t('journey.stat.badges'), String(stats.badges)],
    [t('journey.stat.winRate'), `${winPct}%`],
    [t('journey.stat.catches'), String(stats.catches)],
    [t('journey.stat.shinies'), String(stats.shinies)],
    [t('journey.stat.titles'), String(stats.titles)],
    [t('journey.stat.fatigue'), `${stats.fatigue}`],
  ];

  return (
    <div className="grid grid-cols-3 gap-1.5" data-testid="journey-stats">
      {cells.map(([label, value]) => (
        <div key={label} className="rounded border px-2 py-1.5" style={{ borderColor: 'hsl(var(--border))' }}>
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground truncate">
            {label}
          </div>
          <div className="font-mono text-sm font-semibold">{value}</div>
        </div>
      ))}
    </div>
  );
}
