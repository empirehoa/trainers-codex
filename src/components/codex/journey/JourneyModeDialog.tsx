import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Compass, Globe } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useI18n } from '@/i18n/useI18n';
import { LOCALES, type Locale } from '@/i18n/strings';
import { isEnabled } from '@/lib/flags';
import { simulate } from '@/journey/engine';
import { TRAINER_NAMES, getPace, getRegion, JOURNEY_REGIONS } from '@/journey/content';
import {
  dailySeed, localDateString, namedRng, pick, randomSeed,
} from '@/journey/prng';
import { parseCurrentJourneyLink } from '@/journey/deeplink';
import { recordDailyPlay, currentStreak } from '@/journey/streak';
import { track } from '@/journey/analytics';
import type {
  JourneyRun, JourneySetup as Setup, JourneyUiState, RecordedChoice, RunSource,
} from '@/journey/types';
import { JourneySetup } from './JourneySetup';
import { JourneyDecision } from './JourneyDecision';
import { JourneyRecap } from './JourneyRecap';
import { JourneyResult } from './JourneyResult';

interface Props {
  open: boolean;
  onClose: () => void;
  onBuilderHandoff: (run: JourneyRun) => void;
  onMerch: (run: JourneyRun, blob: Blob) => void;
  /** Deep-link params captured at app boot, before any history rewriting. */
  link?: ReturnType<typeof parseCurrentJourneyLink>;
}

function defaultSetup(seed: number, source: RunSource = 'fresh'): Setup {
  const region = JOURNEY_REGIONS[0];
  return {
    seed,
    // A pre-filled name means "press start" is genuinely playable on arrival —
    // the 10-second-to-first-choice requirement doesn't survive a blank form.
    trainerName: pick(namedRng(seed, 'default-name'), TRAINER_NAMES),
    regionId: region.id,
    starterId: region.starters[0],
    archetype: 'balance',
    pace: 'normal',
    source,
  };
}

/**
 * Fold deep-link params into a setup draft.
 *
 * Done in the useState initialiser rather than an effect: the link is parsed at
 * module load (before any history rewriting), so it is already available on the
 * first render. Applying it in an effect would mean rendering an un-prefilled
 * setup screen, then immediately re-rendering with the shared seed — a visible
 * flash on exactly the surface a shared link lands on.
 */
function setupFromLink(link: Props['link']): Setup {
  const base = defaultSetup(link?.seed ?? randomSeed(), link?.source ?? 'fresh');
  if (!link || link.seed === null) return base;
  const regionId = link.regionId ?? base.regionId;
  return {
    ...base,
    seed: link.seed,
    source: link.source,
    dailyDate: link.dailyDate ?? undefined,
    pace: link.pace ?? base.pace,
    archetype: link.archetype ?? base.archetype,
    regionId,
    starterId: link.starterId ?? getRegion(regionId).starters[0],
  };
}

export function JourneyModeDialog({ open, onClose, onBuilderHandoff, onMerch, link }: Props) {
  const { t, locale, setLocale } = useI18n();

  const [draft, setDraft] = useState<Setup>(() => setupFromLink(link));
  const [setup, setSetup] = useState<Setup | null>(null);
  const [choices, setChoices] = useState<RecordedChoice[]>([]);
  const [revealed, setRevealed] = useState(0);
  const [cardStage, setCardStage] = useState<'retired' | 'card'>('retired');
  const [sharedSeed, setSharedSeed] = useState<number | null>(
    () => (link?.seed !== null && link?.seed !== undefined && !link.dailyDate ? link.seed : null),
  );
  const [dailyDate, setDailyDate] = useState<string | null>(() => link?.dailyDate ?? null);
  const [invalidLink, setInvalidLink] = useState(() => link?.hadInvalidParams ?? false);

  const startedAt = useRef<number>(0);
  const completedRef = useRef(false);
  const dailyRecorded = useRef(false);

  // ---------- the simulation snapshot ----------
  const snapshot = useMemo(
    () => (setup ? simulate(setup, choices) : null),
    [setup, choices],
  );

  const uiState: JourneyUiState = useMemo(() => {
    if (!setup || !snapshot) return 'setup';
    if (snapshot.chapters.length > revealed) return 'chapter-recap';
    if (snapshot.status === 'awaiting-decision') return 'decision';
    return cardStage === 'card' ? 'card' : 'retired';
  }, [setup, snapshot, revealed, cardStage]);

  // ---------- analytics: completion ----------
  useEffect(() => {
    if (!setup || !snapshot?.run || completedRef.current) return;
    completedRef.current = true;
    const run = snapshot.run;
    track({
      event: 'run_completed',
      durationMs: startedAt.current ? Date.now() - startedAt.current : 0,
      score: run.score,
      verdict: run.verdict.id,
      chapters: run.chapterCount,
      pace: setup.pace,
      archetype: setup.archetype,
      source: setup.source,
      seed: setup.seed,
    });

    // A Daily counts once per local date, and only on completion — an
    // abandoned run must not extend a streak.
    if (setup.source === 'daily' && setup.dailyDate && !dailyRecorded.current) {
      dailyRecorded.current = true;
      const state = recordDailyPlay(setup.dailyDate);
      track({
        event: 'daily_played',
        streak: currentStreak(state, setup.dailyDate),
        date: setup.dailyDate,
        score: run.score,
        seed: setup.seed,
      });
    }
  }, [setup, snapshot]);

  // ---------- lifecycle ----------
  const beginRun = useCallback((next: Setup) => {
    startedAt.current = Date.now();
    completedRef.current = false;
    dailyRecorded.current = false;
    setSetup(next);
    setChoices([]);
    setRevealed(0);
    setCardStage('retired');
    track({
      event: 'run_started',
      pace: next.pace,
      archetype: next.archetype,
      source: next.source,
      seed: next.seed,
    });
  }, []);

  const start = useCallback(() => beginRun(draft), [beginRun, draft]);

  const playDaily = useCallback(() => {
    const date = localDateString();
    setDailyDate(date);
    const next: Setup = {
      ...draft,
      seed: dailySeed(date),
      source: 'daily',
      dailyDate: date,
    };
    setDraft(next);
    beginRun(next);
  }, [draft, beginRun]);

  const clearShared = useCallback(() => {
    setSharedSeed(null);
    setDailyDate(null);
    setInvalidLink(false);
    setDraft(defaultSetup(randomSeed()));
  }, []);

  const pick_ = useCallback((optionId: string) => {
    if (!snapshot?.decision) return;
    setChoices(prev => [...prev, {
      chapterIndex: snapshot.decision!.chapterIndex,
      cardId: snapshot.decision!.card.id,
      optionId,
    }]);
  }, [snapshot]);

  const undo = useCallback(() => {
    setChoices(prev => prev.slice(0, -1));
    // Rewind the reveal cursor to the start of the chapter block that the
    // undone choice produced, so the player re-reads what they're changing.
    setRevealed(prev => {
      if (!setup) return prev;
      const { decisionEvery } = getPace(setup.pace);
      return Math.max(0, prev - decisionEvery);
    });
  }, [setup]);

  const continueOn = useCallback(() => {
    if (!snapshot) return;
    setRevealed(snapshot.chapters.length);
  }, [snapshot]);

  /** Take the first option at every remaining decision, then reveal the end. */
  const skipToEnd = useCallback(() => {
    if (!setup) return;
    const acc = [...choices];
    // Bounded by MAX_CHAPTERS decisions; the guard is a runaway-loop backstop.
    for (let i = 0; i < 32; i++) {
      const snap = simulate(setup, acc);
      if (snap.status !== 'awaiting-decision' || !snap.decision) {
        setChoices(acc);
        setRevealed(snap.chapters.length);
        return;
      }
      acc.push({
        chapterIndex: snap.decision.chapterIndex,
        cardId: snap.decision.card.id,
        optionId: snap.decision.card.options[0].id,
      });
    }
    setChoices(acc);
  }, [setup, choices]);

  const replay = useCallback(() => {
    if (!setup) return;
    beginRun({ ...setup });
  }, [setup, beginRun]);

  const newJourney = useCallback(() => {
    const fresh = defaultSetup(randomSeed());
    setSharedSeed(null);
    setDailyDate(null);
    setDraft(fresh);
    setSetup(null);
    setChoices([]);
    setRevealed(0);
    setCardStage('retired');
  }, []);

  // ---------- abandon tracking ----------
  const handleClose = useCallback(() => {
    if (setup && snapshot && snapshot.status !== 'complete') {
      track({
        event: 'run_abandoned',
        state: uiState,
        chapters: snapshot.chapters.length,
        durationMs: startedAt.current ? Date.now() - startedAt.current : 0,
        seed: setup.seed,
      });
    }
    onClose();
  }, [setup, snapshot, uiState, onClose]);

  if (!isEnabled('JOURNEY_MODE')) {
    return null;
  }

  const unrevealed = snapshot ? snapshot.chapters.slice(revealed) : [];

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) handleClose(); }}>
      <DialogContent
        className="max-w-md p-0 gap-0 max-h-[94vh] overflow-y-auto scroll-y bg-card"
        data-testid="journey-dialog"
      >
        <DialogHeader className="px-4 py-3 border-b sticky top-0 bg-card z-10">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <DialogTitle className="font-display text-lg text-primary lowercase">
                <Compass size={16} className="inline mr-1.5" />
                {t('journey.title')}
              </DialogTitle>
              <DialogDescription className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                // {t('journey.tagline')}
              </DialogDescription>
            </div>
            <Select value={locale} onValueChange={v => setLocale(v as Locale)}>
              <SelectTrigger className="w-[104px] h-8 font-mono text-[10px] shrink-0"
                             aria-label={t('journey.locale.label')}
                             data-testid="journey-locale">
                <Globe size={11} className="mr-1 shrink-0" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOCALES.map(l => (
                  <SelectItem key={l.id} value={l.id} className="font-mono text-[10px]">
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </DialogHeader>

        {uiState === 'setup' && (
          <JourneySetup
            draft={draft}
            onChange={setDraft}
            onStart={start}
            sharedSeed={sharedSeed}
            dailyDate={dailyDate}
            invalidLink={invalidLink}
            onClearShared={clearShared}
            onPlayDaily={playDaily}
          />
        )}

        {uiState === 'chapter-recap' && snapshot && (
          <JourneyRecap
            chapters={unrevealed}
            chapterCount={snapshot.chapterCount}
            onContinue={continueOn}
            onSkipToEnd={snapshot.status === 'awaiting-decision' ? skipToEnd : null}
          />
        )}

        {uiState === 'decision' && snapshot?.decision && (
          <JourneyDecision
            decision={snapshot.decision}
            stats={snapshot.stats}
            chapterCount={snapshot.chapterCount}
            onPick={pick_}
            onUndo={choices.length > 0 ? undo : null}
          />
        )}

        {(uiState === 'retired' || uiState === 'card') && snapshot?.run && (
          <JourneyResult
            run={snapshot.run}
            stage={cardStage}
            onRevealCard={() => setCardStage('card')}
            onReplay={replay}
            onNewJourney={newJourney}
            onBuilderHandoff={onBuilderHandoff}
            onMerch={onMerch}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
