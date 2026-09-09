import { useCallback, useMemo, useState } from 'react';
import { Dices, Play, Sparkles, Wrench, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/i18n/useI18n';
import {
  ARCHETYPES, JOURNEY_REGIONS, PACES, TRAINER_NAMES, getRegion, rosterCaption,
} from '@/journey/content';
import { CAMPAIGNS } from '@/journey/campaign';
import { listArchive } from '@/journey/archive';
import { listFinished, listInProgress, type SavedRun } from '@/journey/saves';
import { PremiumUnlockCTA } from '@/components/codex/PremiumControl';
import { trackCommerce } from '@/lib/commerce-analytics';
import { Lock, Play as PlayIcon, Trophy } from 'lucide-react';
import { dailyIssueNumber, localDateString, namedRng, pick, randomSeed } from '@/journey/prng';
import {
  currentStreak, hasPlayedToday, loadStreak, repairableDate, repairsRemaining, repairStreak,
} from '@/journey/streak';
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
  /** Play a past archive issue by its date. */
  onPlayIssue: (date: string) => void;
  /** Premium entitlement — the archive and extra career saves key off it. */
  premium: boolean;
  onTogglePremium?: () => void;
  /** Resume a saved in-progress career. */
  onResume: (save: SavedRun) => void;
}

export function JourneySetup({
  draft, onChange, onStart, sharedSeed, dailyDate, invalidLink,
  onClearShared, onPlayDaily, onPlayIssue, premium, onTogglePremium, onResume,
}: Props) {
  const { t } = useI18n();
  const region = getRegion(draft.regionId);
  // Re-read after a repair so the streak line and the offer both refresh.
  const [streakNonce, setStreakNonce] = useState(0);
  const streak = useMemo(() => loadStreak(), [streakNonce]);
  const today = localDateString();
  const playedToday = hasPlayedToday(streak, today);
  const streakDays = currentStreak(streak, today);
  const repairDate = repairableDate(streak, today);
  const repairsLeft = repairsRemaining(streak);
  const [showArchive, setShowArchive] = useState(false);
  const inProgress = useMemo(() => listInProgress(), []);
  const finished = useMemo(() => listFinished(), []);
  const archive = useMemo(
    () => listArchive({
      today,
      // playedDates lights the ✓; archive completions count for the ✓ too,
      // they just never count toward the streak (streak.ts).
      playedDates: [...streak.playedDates, ...(streak.archiveDates ?? [])],
      limit: 60,
    }),
    [today, streak.playedDates],
  );

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
                  className="font-mono text-[10px] shrink-0 text-muted-foreground hover:text-primary">
            {t('journey.setup.seedClear')}
          </Button>
        </div>
      ) : null}

      {invalidLink && (
        <div className="font-mono text-[10px] text-muted-foreground" data-testid="journey-invalid-seed">
          // {t('journey.setup.seedInvalid')}
        </div>
      )}

      {/* ---- careers: resume + Hall of Fame ----
          The engine has serialized saves since v9; this is the surface. Free
          resumes the most recent career — one thread of continuity for
          everyone. Premium keeps the whole shelf plus the trophies. */}
      {(inProgress.length > 0 || finished.length > 0) && (
        <div className="rounded-md border p-3 space-y-2" style={{ borderColor: 'hsl(var(--border))' }}
             data-testid="journey-careers">
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {t('journey.saves.heading')}
          </div>
          {inProgress.map((save, i) => {
            const locked = !premium && i > 0;
            return (
              <button key={save.id}
                      onClick={() => {
                        if (locked) {
                          trackCommerce({ event: 'paywall_shown', surface: 'journey-saves' });
                          return;
                        }
                        onResume(save);
                      }}
                      aria-disabled={locked}
                      className={`w-full flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-left transition ${locked ? 'opacity-60 cursor-not-allowed' : 'hover:border-primary/60'}`}
                      style={{ borderColor: 'hsl(var(--border))' }}
                      data-testid={`journey-resume-${save.id}`}>
                <span className="font-mono text-[10px] flex items-center gap-1.5 min-w-0">
                  {locked ? <Lock size={9} className="text-primary shrink-0" /> : <PlayIcon size={9} className="text-primary shrink-0" />}
                  <span className="truncate">
                    {save.setup.trainerName} · {t('journey.saves.chapter', { n: save.chapter })}
                  </span>
                </span>
                <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                  {locked ? t('journey.saves.locked') : t('journey.saves.resume')}
                </span>
              </button>
            );
          })}
          {finished.length > 0 && (
            premium ? (
              <div className="space-y-1" data-testid="journey-hof">
                <div className="font-mono text-[10px] text-muted-foreground flex items-center gap-1">
                  <Trophy size={9} className="text-primary" /> {t('journey.saves.hof')}
                </div>
                {finished.slice(0, 8).map(save => (
                  <button key={save.id}
                          onClick={() => onResume(save)}
                          className="w-full flex items-center justify-between gap-2 rounded border px-2 py-1 text-left transition hover:border-primary/60"
                          style={{ borderColor: 'hsl(var(--border))' }}
                          data-testid={`journey-hof-${save.id}`}>
                    <span className="font-mono text-[10px] truncate">
                      {save.setup.trainerName}{save.verdictKey ? ` · ${t(save.verdictKey, { region: '' }).trim()}` : ''}
                    </span>
                    <span className="font-mono text-[10px] text-primary shrink-0">{save.score ?? '—'}</span>
                  </button>
                ))}
              </div>
            ) : (
              <button
                onClick={() => trackCommerce({ event: 'paywall_shown', surface: 'journey-saves' })}
                className="w-full flex items-center justify-between gap-2 rounded border border-dashed px-2 py-1.5"
                style={{ borderColor: 'hsl(var(--primary)/0.4)' }}
                data-testid="journey-hof-paywall">
                <span className="font-mono text-[10px] text-muted-foreground flex items-center gap-1.5">
                  <Trophy size={9} className="text-primary" />
                  {t('journey.saves.hofLocked', { n: finished.length })}
                </span>
                <PremiumUnlockCTA onTogglePremium={onTogglePremium}
                                  label={t('journey.archive.unlock')}
                                  surface="journey-saves" />
              </button>
            )
          )}
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
            aria-label={t('journey.setup.name')}
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
                     className="pixelated w-10 h-10 sm:w-12 sm:h-12" loading="lazy" />
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
      {/* The setup screen ran 1.8 screens on a 390px phone with the Start button
          1.5 screens down, on a mode whose promise is "a career in three
          minutes". Archetype rows go two-up; pace and campaign become segmented
          controls. Every testid is unchanged. */}
      <Field label={t('journey.setup.archetype')}>
        <div className="grid grid-cols-2 gap-1">
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
        <div className="grid grid-cols-3 gap-1">
          {PACES.map(p => (
            <Segment
              key={p.id}
              active={draft.pace === p.id}
              onClick={() => onChange({ ...draft, pace: p.id as Pace })}
              title={t(`journey.pace.${p.id}`)}
              sub={`${p.approxMinutes} min`}
              testId={`journey-pace-${p.id}`}
            />
          ))}
        </div>
        <p className="font-mono text-[10px] text-muted-foreground mt-1.5" data-testid="journey-hint-pace">
          {t(`journey.pace.${draft.pace}.desc`, { minutes: PACES.find(p => p.id === draft.pace)?.approxMinutes ?? 0 })}
        </p>
      </Field>

      {/* ---- campaign length ---- */}
      <Field label={t('journey.campaign.label')}>
        <div className="grid grid-cols-3 gap-1">
          {CAMPAIGNS.map(c => (
            <Segment
              key={c.id}
              active={(draft.campaign ?? 'short') === c.id}
              onClick={() => onChange({ ...draft, campaign: c.id })}
              title={t(c.nameKey)}
              sub={c.approx}
              testId={`journey-campaign-${c.id}`}
            />
          ))}
        </div>
        <p className="font-mono text-[10px] text-muted-foreground mt-1.5" data-testid="journey-hint-campaign">
          {t(CAMPAIGNS.find(c => c.id === (draft.campaign ?? 'short'))?.descKey ?? CAMPAIGNS[0].descKey)}
        </p>
      </Field>

      {/* ---- start ---- */}
      {/* Sticky on phones: the form ran 1.5 screens and this button sat at
          ~1,020px, so the mode that promises a three-minute career opened with
          a scroll to find Start. Pinned to the dialog's bottom edge under 640px
          with the safe-area inset honoured; ordinary flow from sm: up. */}
      <div className="sticky bottom-0 -mx-4 px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] bg-card/95 backdrop-blur-sm border-t sm:static sm:mx-0 sm:px-0 sm:pt-0 sm:pb-0 sm:border-0 sm:bg-transparent sm:backdrop-blur-none"
           style={{ borderColor: 'hsl(var(--border))' }}>
      <Button onClick={onStart} className="w-full font-mono text-xs font-bold h-11"
              data-testid="journey-start">
        <Play size={13} className="mr-1.5" />
        {t('journey.setup.start')}
      </Button>
      </div>

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
          {/* Streak repair. Offered only when there is a real one-day gap that
              a repair would bridge, and only while a free one is unspent — so it
              is an offer, never a permanent upsell shaped like a button. */}
          {repairDate && (
            <div className="flex items-center justify-between gap-2 pt-1 border-t"
                 style={{ borderColor: 'hsl(var(--border))' }}
                 data-testid="journey-repair-offer">
              <div className="font-mono text-[10px] text-amber-600 dark:text-amber-400">
                {t('journey.daily.repairOffer', { date: repairDate })}
                <span className="text-muted-foreground ml-1">
                  {t('journey.daily.repairsLeft', { n: repairsLeft })}
                </span>
              </div>
              <Button variant="outline" size="sm"
                      onClick={() => {
                        repairStreak(repairDate);
                        setStreakNonce(n => n + 1);
                      }}
                      className="font-mono text-[10px] shrink-0"
                      data-testid="journey-repair">
                <Wrench size={11} className="mr-1" />
                {t('journey.daily.repair')}
              </Button>
            </div>
          )}
          {playedToday && (
            <div className="font-mono text-[10px] text-muted-foreground">// {t('journey.daily.done')}</div>
          )}

          {/* Archive. A player who arrives on day 40 otherwise has one puzzle
              available and 39 they can never see. Bounded render — the list
              grows by one every day, forever. */}
          {archive.length > 1 && (
            <div className="pt-1 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
              <button onClick={() => setShowArchive(v => !v)}
                      className="font-mono text-[10px] text-muted-foreground hover:text-primary transition min-h-9"
                      data-testid="journey-archive-toggle">
                {showArchive ? '▾' : '▸'} {t('journey.archive.heading', { n: archive.length })}
              </button>
              {showArchive && (
                <div className="mt-1.5 max-h-40 overflow-y-auto space-y-1" data-testid="journey-archive">
                  {/* The daily stays free forever; PAST issues are the premium
                      archive (the NYT model: sell the back catalogue, never
                      the day). Locked rows stay visible — a lock you can see
                      is a pitch, a hidden feature is nothing. */}
                  {!premium && (
                    <div className="flex items-center justify-between gap-2 rounded border border-dashed px-2 py-1.5"
                         style={{ borderColor: 'hsl(var(--primary)/0.4)' }}
                         data-testid="journey-archive-paywall">
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {t('journey.archive.premiumPitch')}
                      </span>
                      <PremiumUnlockCTA onTogglePremium={onTogglePremium}
                                        label={t('journey.archive.unlock')}
                                        surface="journey-archive" />
                    </div>
                  )}
                  {archive.filter(e => !e.today).map(e => {
                    const locked = !premium;
                    return (
                      <button key={e.date}
                              onClick={() => {
                                if (locked) {
                                  trackCommerce({ event: 'paywall_shown', surface: 'journey-archive' });
                                  return;
                                }
                                onPlayIssue(e.date);
                              }}
                              aria-disabled={locked}
                              className={`w-full flex items-center justify-between gap-2 rounded border px-2 py-1
                                         text-left transition ${locked ? 'opacity-60 cursor-not-allowed' : 'hover:border-primary/60'}`}
                              style={{ borderColor: 'hsl(var(--border))' }}
                              data-testid={`journey-archive-${e.issue}`}>
                        <span className="font-mono text-[10px] flex items-center gap-1.5">
                          {locked && <Lock size={9} className="text-primary shrink-0" data-testid={`journey-archive-lock-${e.issue}`} />}
                          {t('journey.archive.issue', { n: e.issue })}
                          <span className="text-muted-foreground">{e.date}</span>
                        </span>
                        <span className="font-mono text-[10px] shrink-0"
                              style={{ color: e.played ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))' }}>
                          {e.played ? t('journey.archive.played') : t('journey.archive.unplayed')}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
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
        'font-mono text-[10px] px-2.5 min-h-9 rounded border transition uppercase tracking-wider',
        active ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground hover:border-primary',
      )}
    >
      {children}
    </button>
  );
}

/** One cell of a segmented control: title on top, a short sub underneath. */
function Segment({ active, onClick, title, sub, testId }: {
  active: boolean; onClick: () => void; title: string; sub: string; testId?: string;
}) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      aria-pressed={active}
      className={cn(
        'rounded border px-2 py-2 min-h-11 text-center transition',
        active ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50',
      )}
    >
      <div className="font-mono text-xs font-semibold truncate">{title}</div>
      <div className="font-mono text-[10px] text-muted-foreground mt-0.5 truncate">{sub}</div>
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
      <div className="font-mono text-[10px] text-muted-foreground mt-0.5 hidden sm:block">{sub}</div>
    </button>
  );
}
