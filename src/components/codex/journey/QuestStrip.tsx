import { Target, Check } from 'lucide-react';
import { useI18n } from '@/i18n/useI18n';
import { cn } from '@/lib/utils';
import type { Quest } from '@/journey/types';

/**
 * The quest board — 3-5 near-term goals with visible progress bars. This is
 * the "openings" layer: a long campaign needs something to be chasing between
 * gyms, and a completed quest pays out an item plus a score multiplier.
 */
export function QuestStrip({ quests }: { quests: Quest[] }) {
  const { t } = useI18n();
  if (!quests.length) return null;

  return (
    <div className="rounded-md border px-2.5 py-2"
         style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--card))' }}
         data-testid="journey-quests">
      <div className="font-mono text-[10px] uppercase tracking-wider text-primary mb-1.5 flex items-center gap-1">
        <Target size={10} /> {t('journey.quest.heading')}
      </div>
      <div className="space-y-1.5">
        {quests.map(q => (
          <div key={q.id} data-testid={q.complete ? 'journey-quest-done' : 'journey-quest-open'}>
            <div className="flex items-center justify-between gap-2">
              <span className={cn(
                'font-mono text-[10px] truncate flex items-center gap-1',
                q.complete ? 'text-emerald-500' : 'text-foreground/90',
              )}>
                {q.complete && <Check size={9} />}
                {t(q.titleKey, { n: q.target })}
              </span>
              <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                {q.progress}/{q.target}
              </span>
            </div>
            <div className="h-1 mt-0.5 rounded-full overflow-hidden" style={{ background: 'hsl(var(--muted))' }}>
              <div className={cn('h-full', q.complete ? 'bg-emerald-500' : 'bg-primary/70')}
                   style={{ width: `${Math.round((q.progress / Math.max(1, q.target)) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
