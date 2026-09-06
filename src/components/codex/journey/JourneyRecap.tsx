import { ArrowRight, FastForward, Trophy, Swords, Sparkles, Gift, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n/useI18n';
import { ProgressHeader, StatStrip } from './JourneyDecision';
import { PartyRail } from './PartyRail';
import { BadgeTrack } from './BadgeTrack';
import { AreaMap } from './AreaMap';
import { pixelSprite } from '@/lib/pokemon';
import { rosterCaption } from '@/journey/content';
import { TYPE_COLORS } from '@/lib/constants';
import type {
  BadgeEarned, ChapterResult, DexState, OpponentResult, RegionProgress, RosterEntry,
} from '@/journey/types';

/**
 * One named fight's outcome.
 *
 * Gym badges are won by beating the leader now, so the result of the fight is
 * the most consequential thing in the chapter — it used to leave no trace in
 * the recap beyond the badge counter moving.
 */
function BattleRow({ battle: b }: { battle: OpponentResult }) {
  const { t } = useI18n();
  const colour = TYPE_COLORS[b.specialty] ?? 'hsl(var(--primary))';
  return (
    <div className="flex items-start gap-2 mt-2 pt-2 border-t"
         style={{ borderColor: 'hsl(var(--border))' }}
         data-testid="journey-battle-row"
         data-won={b.won ? '1' : '0'}>
      <Swords size={11} className="mt-0.5 shrink-0" style={{ color: colour }} />
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[10px] flex items-center gap-1.5 flex-wrap">
          <span className={b.won ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}>
            {t(b.won ? 'journey.battle.beat' : 'journey.battle.lostTo', { name: b.name })}
          </span>
          <span className="text-muted-foreground">· {b.title}</span>
          {b.rematch && (
            <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
              <RotateCcw size={9} />{t('journey.battle.rematch')}
            </span>
          )}
          {!!b.badgeAwarded && (
            <span className="px-1 py-0.5 rounded font-bold"
                  style={{ background: `${colour}22`, color: colour }}>
              {t('journey.battle.badge')}
            </span>
          )}
        </div>
        <div className="font-mono text-[10px] text-muted-foreground mt-0.5">
          {t('journey.battle.level', { level: b.level })} · {b.specialty}
          {b.strongPicks?.length ? ` · ${t('journey.battle.strong', { n: b.strongPicks.length })}` : ''}
          {b.weakPicks?.length ? ` · ${t('journey.battle.weak', { n: b.weakPicks.length })}` : ''}
        </div>
      </div>
    </div>
  );
}

interface Props {
  /** The chapters resolved since the player last looked. */
  chapters: ChapterResult[];
  chapterCount: number;
  /** Live team + dex, so the six stays in view between decisions. */
  roster: RosterEntry[];
  dex: DexState;
  badges: BadgeEarned[];
  /** Run seed — the area map is generated from it. */
  seed: number;
  region: RegionProgress;
  onContinue: () => void;
  onSkipToEnd: (() => void) | null;
}

export function JourneyRecap({
  chapters, chapterCount, roster, dex, badges, region, onContinue, onSkipToEnd, seed,
}: Props) {
  const { t } = useI18n();
  const last = chapters[chapters.length - 1];
  if (!last) return null;

  return (
    <div className="p-4 space-y-4" data-testid="journey-recap">
      <ProgressHeader chapter={last.index + 1} total={chapterCount} age={last.age} />

      <BadgeTrack badges={badges} region={region} />
      <AreaMap seed={seed} region={region} />

      <PartyRail roster={roster} dex={dex} />

      <div className="space-y-3">
        {chapters.map(ch => (
          <div key={ch.index} className="rounded-md border p-3"
               style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--card))' }}>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="font-mono text-[10px] uppercase tracking-wider text-primary">
                {t(ch.titleKey)}
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
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
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary flex items-center gap-1">
                  <Trophy size={9} /> +{ch.delta.titles}
                </span>
              )}
            </div>

            {ch.battles?.map((b, i) => <BattleRow key={`${b.name}-${i}`} battle={b} />)}

            {ch.eventMonId !== undefined && (
              <div className="flex items-center gap-2 mt-2 pt-2 border-t"
                   style={{ borderColor: 'hsl(var(--border))' }}
                   data-testid="journey-event-mon">
                <img src={pixelSprite(ch.eventMonId, ch.eventMonShiny)} alt="" width={32} height={32}
                     className="pixelated shrink-0" loading="lazy" />
                <span className="font-mono text-[10px] flex items-center gap-1
                                 text-fuchsia-600 dark:text-fuchsia-400">
                  {ch.eventMonShiny
                    ? <Sparkles size={10} className="text-yellow-500 dark:text-yellow-400" />
                    : <Gift size={10} />}
                  {t(ch.eventMonShiny ? 'journey.recap.eventShiny' : 'journey.recap.event',
                     { mon: rosterCaption(ch.eventMonId) })}
                </span>
              </div>
            )}

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
    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded"
          style={{
            background: positive ? 'hsl(var(--primary)/0.12)' : 'hsl(var(--muted))',
            color: positive ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
          }}>
      {label} +{value}
    </span>
  );
}
