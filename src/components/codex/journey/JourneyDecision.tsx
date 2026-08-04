import { ChevronRight, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n/useI18n';
import { cn } from '@/lib/utils';
import type { CareerStats, PendingDecision } from '@/journey/types';

interface Props {
  decision: PendingDecision;
  stats: CareerStats;
  chapterCount: number;
  onPick: (optionId: string) => void;
  onUndo: (() => void) | null;
}

export function JourneyDecision({ decision, stats, chapterCount, onPick, onUndo }: Props) {
  const { t } = useI18n();
  const { card, vars } = decision;

  return (
    <div className="p-4 space-y-4" data-testid="journey-decision">
      <ProgressHeader
        chapter={decision.chapterIndex + 1}
        total={chapterCount}
        age={stats.age}
      />

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
              <ChevronRight size={13} className="shrink-0 text-muted-foreground group-hover:text-primary" />
            </div>
            <div className="font-mono text-[10px] text-muted-foreground mt-1">
              {t(opt.flavorKey, vars)}
            </div>
          </button>
        ))}
      </div>

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
          <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground truncate">
            {label}
          </div>
          <div className="font-mono text-sm font-semibold">{value}</div>
        </div>
      ))}
    </div>
  );
}
