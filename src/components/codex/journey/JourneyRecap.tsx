import { ArrowRight, FastForward, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n/useI18n';
import { ProgressHeader, StatStrip } from './JourneyDecision';
import { pixelSprite } from '@/lib/pokemon';
import { rosterCaption } from '@/journey/content';
import type { ChapterResult } from '@/journey/types';

interface Props {
  /** The chapters resolved since the player last looked. */
  chapters: ChapterResult[];
  chapterCount: number;
  onContinue: () => void;
  onSkipToEnd: (() => void) | null;
}

export function JourneyRecap({ chapters, chapterCount, onContinue, onSkipToEnd }: Props) {
  const { t } = useI18n();
  const last = chapters[chapters.length - 1];
  if (!last) return null;

  return (
    <div className="p-4 space-y-4" data-testid="journey-recap">
      <ProgressHeader chapter={last.index + 1} total={chapterCount} age={last.age} />

      <div className="space-y-3">
        {chapters.map(ch => (
          <div key={ch.index} className="rounded-md border p-3"
               style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--card))' }}>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="font-mono text-[10px] uppercase tracking-wider text-primary">
                {t(ch.titleKey)}
              </span>
              <span className="font-mono text-[9px] text-muted-foreground">
                {t('journey.sim.age', { age: ch.age })}
              </span>
            </div>

            {ch.beatKeys.map(key => (
              <p key={key} className="text-xs leading-relaxed text-foreground/90 mb-1">
                {t(key, ch.vars)}
              </p>
            ))}

            <div className="flex items-center gap-2 flex-wrap mt-2">
              <Delta label={t('journey.stat.wins')} value={ch.delta.wins} positive />
              <Delta label={t('journey.stat.losses')} value={ch.delta.losses} />
              {!!ch.delta.badges && <Delta label={t('journey.stat.badges')} value={ch.delta.badges} positive />}
              {!!ch.delta.catches && <Delta label={t('journey.stat.catches')} value={ch.delta.catches} positive />}
              {!!ch.delta.shinies && <Delta label={t('journey.stat.shinies')} value={ch.delta.shinies} positive />}
              {!!ch.delta.titles && (
                <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-primary/15 text-primary flex items-center gap-1">
                  <Trophy size={9} /> +{ch.delta.titles}
                </span>
              )}
            </div>

            {ch.recruitedId !== undefined && (
              <div className="flex items-center gap-2 mt-2 pt-2 border-t"
                   style={{ borderColor: 'hsl(var(--border))' }}>
                <img src={pixelSprite(ch.recruitedId, ch.recruitedShiny)} alt="" width={32} height={32}
                     className="pixelated shrink-0" loading="lazy" />
                <span className="font-mono text-[10px] text-muted-foreground">
                  + {rosterCaption(ch.recruitedId)}{ch.recruitedShiny ? ' ★' : ''}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      <StatStrip stats={last.stats} />

      <div className="flex gap-2">
        <Button onClick={onContinue} className="flex-1 font-mono text-xs font-bold h-10"
                data-testid="journey-continue">
          {t('journey.sim.continue')}
          <ArrowRight size={13} className="ml-1.5" />
        </Button>
        {onSkipToEnd && (
          <Button variant="outline" onClick={onSkipToEnd} className="font-mono text-[10px] shrink-0 h-10"
                  data-testid="journey-skip">
            <FastForward size={12} className="mr-1" />
            {t('journey.sim.skipToEnd')}
          </Button>
        )}
      </div>
    </div>
  );
}

function Delta({ label, value, positive }: { label: string; value?: number; positive?: boolean }) {
  if (!value) return null;
  return (
    <span className="font-mono text-[9px] px-1.5 py-0.5 rounded"
          style={{
            background: positive ? 'hsl(var(--primary)/0.12)' : 'hsl(var(--muted))',
            color: positive ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
          }}>
      {label} +{value}
    </span>
  );
}
