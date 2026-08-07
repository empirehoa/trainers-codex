import { useCallback } from 'react';
import { Dices, Play, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/i18n/useI18n';
import {
  ARCHETYPES, JOURNEY_REGIONS, PACES, TRAINER_NAMES, getRegion, rosterCaption,
} from '@/journey/content';
import { CAMPAIGNS } from '@/journey/campaign';
import { dailyIssueNumber, localDateString, namedRng, pick, randomSeed } from '@/journey/prng';
import { currentStreak, hasPlayedToday, loadStreak } from '@/journey/streak';
import { pixelSprite } from '@/lib/pokemon';
import { cn } from '@/lib/utils';
import type { Archetype, JourneySetup as Setup, Pace } from '@/journey/types';

interface Props {
  draft: Setup;
  onChange: (next: Setup) => void;
  onStart: () => void;
  /** Set when the run came in via a ?seed= or ?daily= link. */
  sharedSeed: number | null;
  dailyDate: string | null;
  invalidLink: boolean;
  onClearShared: () => void;
  onPlayDaily: () => void;
}

export function JourneySetup({
  draft, onChange, onStart, sharedSeed, dailyDate, invalidLink,
  onClearShared, onPlayDaily,
}: Props) {
  const { t } = useI18n();
  const region = getRegion(draft.regionId);
  const streak = loadStreak();
  const today = localDateString();
  const playedToday = hasPlayedToday(streak, today);
  const streakDays = currentStreak(streak, today);

  const rollName = useCallback(() => {
    onChange({ ...draft, trainerName: pick(namedRng(randomSeed(), 'name'), TRAINER_NAMES) });
  }, [draft, onChange]);

  const setRegion = useCallback((regionId: string) => {
    // Starter must belong to the region, so switching region resets it.
    onChange({ ...draft, regionId, starterId: getRegion(regionId).starters[0] });
  }, [draft, onChange]);

  return (
    <div className="p-4 space-y-4" data-testid="journey-setup">
      {/* ---- shared-seed / daily banner ---- */}
      {dailyDate ? (
        <div className="rounded-md border px-3 py-2 flex items-center justify-between gap-2"
             style={{ borderColor: 'hsl(var(--primary)/0.5)', background: 'hsl(var(--primary)/0.08)' }}>
          <div className="font-mono text-[10px] text-primary" data-testid="journey-daily-banner">
            {t('journey.setup.dailyBanner', { issue: dailyIssueNumber(dailyDate) })}
          </div>
          <Button variant="ghost" size="icon" onClick={onClearShared} className="w-6 h-6 shrink-0">
            <X size={11} />
          </Button>
        </div>
      ) : sharedSeed !== null ? (
        <div className="rounded-md border px-3 py-2 flex items-center justify-between gap-2"
             style={{ borderColor: 'hsl(var(--primary)/0.5)', background: 'hsl(var(--primary)/0.08)' }}>
          <div className="font-mono text-[10px] text-primary" data-testid="journey-seed-banner">
            {t('journey.setup.seedShared', { seed: sharedSeed })}
          </div>
          <Button variant="ghost" size="sm" onClick={onClearShared}
                  className="font-mono text-[9px] shrink-0 text-muted-foreground hover:text-primary">
            {t('journey.setup.seedClear')}
          </Button>
        </div>
      ) : null}

      {invalidLink && (
        <div className="font-mono text-[10px] text-muted-foreground" data-testid="journey-invalid-seed">
          // {t('journey.setup.seedInvalid')}
        </div>
      )}

      <div>
        <h2 className="font-display text-xl text-primary lowercase">{t('journey.setup.heading')}</h2>
        <p className="font-mono text-[10px] text-muted-foreground mt-0.5">// {t('journey.setup.sub')}</p>
      </div>

      {/* ---- name ---- */}
      <Field label={t('journey.setup.name')}>
        <div className="flex gap-2">
          <Input
            value={draft.trainerName}
            onChange={e => onChange({ ...draft, trainerName: e.target.value.slice(0, 24) })}
            className="font-mono text-xs"
            data-testid="journey-name"
          />
          <Button variant="outline" size="icon" onClick={rollName} className="shrink-0 w-9 h-9"
                  aria-label={t('journey.setup.nameRandom')}>
            <Dices size={13} />
          </Button>
        </div>
      </Field>

      {/* ---- region ---- */}
      <Field label={t('journey.setup.region')}>
        <div className="flex flex-wrap gap-1">
          {JOURNEY_REGIONS.map(r => (
            <Chip key={r.id} active={draft.regionId === r.id} onClick={() => setRegion(r.id)}>
              {r.label}
            </Chip>
          ))}
        </div>
      </Field>

      {/* ---- starter ---- */}
      <Field label={t('journey.setup.starter')}>
        <div className="grid grid-cols-3 gap-2">
          {region.starters.map(id => {
            const active = draft.starterId === id;
            return (
              <button
                key={id}
                onClick={() => onChange({ ...draft, starterId: id })}
                data-testid={`journey-starter-${id}`}
                className={cn(
                  'rounded-md border p-2 transition flex flex-col items-center gap-1',
                  active ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50',
                )}
              >
                <img src={pixelSprite(id)} alt="" width={48} height={48}
                     className="pixelated" loading="lazy" />
                {/*
                  Through rosterCaption, not POKEMON_BY_ID[id].display — the
                  starter picker is a user-visible reference to a species and so
                  belongs behind the same flavor-layer chokepoint as everything
                  else. Reading .display here silently bypassed the
                  JOURNEY_SPECIES_FLAVOR degradation path.
                */}
                <span className="font-mono text-[10px] truncate max-w-full">{rosterCaption(id)}</span>
              </button>
            );
          })}
        </div>
      </Field>

      {/* ---- archetype ---- */}
      <Field label={t('journey.setup.archetype')}>
        <div className="space-y-1">
          {ARCHETYPES.map(a => (
            <OptionRow
              key={a}
              active={draft.archetype === a}
              onClick={() => onChange({ ...draft, archetype: a as Archetype })}
              title={t(`journey.archetype.${a}`)}
              sub={t(`journey.archetype.${a}.desc`)}
              testId={`journey-archetype-${a}`}
            />
          ))}
        </div>
      </Field>

      {/* ---- pace ---- */}
      <Field label={t('journey.setup.pace')}>
        <div className="space-y-1">
          {PACES.map(p => (
            <OptionRow
              key={p.id}
              active={draft.pace === p.id}
              onClick={() => onChange({ ...draft, pace: p.id as Pace })}
              title={t(`journey.pace.${p.id}`)}
              sub={t(`journey.pace.${p.id}.desc`, { minutes: p.approxMinutes })}
              testId={`journey-pace-${p.id}`}
            />
          ))}
        </div>
      </Field>

      {/* ---- campaign length ---- */}
      <Field label={t('journey.campaign.label')}>
        <div className="space-y-1">
          {CAMPAIGNS.map(c => (
            <OptionRow
              key={c.id}
              active={(draft.campaign ?? 'short') === c.id}
              onClick={() => onChange({ ...draft, campaign: c.id })}
              title={`${t(c.nameKey)} · ${c.approx}`}
              sub={t(c.descKey)}
              testId={`journey-campaign-${c.id}`}
            />
          ))}
        </div>
      </Field>

      {/* ---- start ---- */}
      <Button onClick={onStart} className="w-full font-mono text-xs font-bold h-11"
              data-testid="journey-start">
        <Play size={13} className="mr-1.5" />
        {t('journey.setup.start')}
      </Button>

      <div className="font-mono text-[10px] text-muted-foreground text-center">
        {t('journey.setup.seedLabel')} {draft.seed}
      </div>

      {/* ---- daily ---- */}
      {!dailyDate && (
        <div className="rounded-md border p-3 space-y-2" style={{ borderColor: 'hsl(var(--border))' }}>
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="font-mono text-xs font-semibold text-primary">
                <Sparkles size={11} className="inline mr-1" />
                {t('journey.daily.issue', { issue: dailyIssueNumber(today) })}
              </div>
              <div className="font-mono text-[10px] text-muted-foreground mt-0.5">
                {t('journey.daily.sub')}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="font-mono text-[10px]" data-testid="journey-streak">
              {streakDays > 0 ? (
                <span className="text-primary">{t('journey.daily.streak', { days: streakDays })}</span>
              ) : (
                <span className="text-muted-foreground">{t('journey.daily.streakNone')}</span>
              )}
              {streak.bestStreak > 0 && (
                <span className="text-muted-foreground ml-2">
                  {t('journey.daily.bestStreak', { days: streak.bestStreak })}
                </span>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={onPlayDaily}
                    className="font-mono text-[10px] shrink-0" data-testid="journey-play-daily">
              {playedToday ? t('journey.daily.replayFree') : t('journey.daily.play')}
            </Button>
          </div>
          {playedToday && (
            <div className="font-mono text-[10px] text-muted-foreground">// {t('journey.daily.done')}</div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-mono uppercase tracking-widest mb-1.5 text-muted-foreground">
        // {label}
      </div>
      {children}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'font-mono text-[10px] px-2 py-1 rounded border transition uppercase tracking-wider',
        active ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground hover:border-primary',
      )}
    >
      {children}
    </button>
  );
}

function OptionRow({ active, onClick, title, sub, testId }: {
  active: boolean; onClick: () => void; title: string; sub: string; testId?: string;
}) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className={cn(
        'w-full text-left rounded border p-2.5 transition',
        active ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50',
      )}
    >
      <div className="font-mono text-xs font-semibold">{title}</div>
      <div className="font-mono text-[10px] text-muted-foreground mt-0.5">{sub}</div>
    </button>
  );
}
