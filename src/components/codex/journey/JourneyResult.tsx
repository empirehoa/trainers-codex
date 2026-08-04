import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight, Copy, Download, Link2, Loader2, RotateCcw, Share2, ShoppingBag, Sparkles, Wrench,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useI18n } from '@/i18n/useI18n';
import { isEnabled } from '@/lib/flags';
import { pixelSprite } from '@/lib/pokemon';
import { rosterCaption } from '@/journey/content';
import { renderLegendCard } from '@/journey/legend-card';
import { buildDailyLink, buildSeedLink } from '@/journey/deeplink';
import { dailyIssueNumber } from '@/journey/prng';
import {
  canShareFile, copyImageToClipboard, copyTextToClipboard, downloadBlob,
  fileFromBlob, legendCardFilename, shareLegendCard,
} from '@/journey/share';
import { track, type ShareMethod } from '@/journey/analytics';
import type { JourneyRun } from '@/journey/types';

interface Props {
  run: JourneyRun;
  stage: 'retired' | 'card';
  onRevealCard: () => void;
  onReplay: () => void;
  onNewJourney: () => void;
  onBuilderHandoff: (run: JourneyRun) => void;
  onMerch: (run: JourneyRun, blob: Blob) => void;
}

export function JourneyResult({
  run, stage, onRevealCard, onReplay, onNewJourney, onBuilderHandoff, onMerch,
}: Props) {
  const { t, locale } = useI18n();
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);
  const urlRef = useRef<string | null>(null);

  const isDaily = run.setup.source === 'daily' && !!run.setup.dailyDate;

  const shareUrl = useMemo(() => (
    isDaily
      ? buildDailyLink(run.setup.dailyDate!)
      : buildSeedLink({
          seed: run.setup.seed,
          pace: run.setup.pace,
          archetype: run.setup.archetype,
          regionId: run.setup.regionId,
          starterId: run.setup.starterId,
        })
  ), [run, isDaily]);

  const verdictText = t(run.verdict.titleKey, {
    region: String(run.chapters[0]?.vars.region ?? ''),
  });

  const shareText = useMemo(() => (
    isDaily
      ? t('journey.share.dailyText', {
          issue: dailyIssueNumber(run.setup.dailyDate!),
          verdict: verdictText,
          score: run.score,
          url: shareUrl,
        })
      : t('journey.share.text', {
          verdict: verdictText,
          score: run.score,
          seed: run.setup.seed,
          url: shareUrl,
        })
  ), [isDaily, run, shareUrl, t, verdictText]);

  const filename = legendCardFilename(run.setup.trainerName, run.setup.seed);

  // ---- render the card ----
  // Rendered ahead of any share interaction on purpose: iOS Safari requires
  // navigator.share() to run inside the user-gesture task, so the blob has to
  // already exist by the time the button is tapped.
  // `alive` guards against the render resolving after the dialog has closed.
  // A card render awaits up to six sprite loads (4s each, worst case), and a
  // user who closes mid-render would otherwise have a blob URL created *after*
  // the unmount cleanup already ran — leaking it for the life of the document.
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const render = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const b = await renderLegendCard({ run, locale });
      if (!alive.current) return;
      setBlob(b);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const next = URL.createObjectURL(b);
      urlRef.current = next;
      setUrl(next);
      setCanShare(canShareFile(fileFromBlob(b, filename)));
    } catch (e) {
      if (!alive.current) return;
      setError(e instanceof Error ? e.message : 'render failed');
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [run, locale, filename]);

  useEffect(() => {
    if (stage !== 'card') return;
    // Deferred a microtask so the state updates inside `render` land after this
    // effect returns rather than cascading a second render out of it.
    let cancelled = false;
    void Promise.resolve().then(() => { if (!cancelled) void render(); });
    return () => { cancelled = true; };
  }, [stage, render]);

  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  const reportShare = useCallback((method: ShareMethod) => {
    track({
      event: 'share_attempted',
      method,
      score: run.score,
      verdict: run.verdict.id,
      seed: run.setup.seed,
      daily: isDaily,
    });
  }, [run, isDaily]);

  const doWebShare = useCallback(async () => {
    if (!blob) return;
    reportShare('webshare');
    const outcome = await shareLegendCard({
      file: fileFromBlob(blob, filename),
      text: shareText,
      title: verdictText,
      url: shareUrl,
    });
    if (!outcome.ok && outcome.reason === 'failed') toast.error(t('journey.share.failed'));
    // 'aborted' means the user dismissed the sheet — not a failure to report.
  }, [blob, filename, shareText, shareUrl, verdictText, reportShare, t]);

  const doCopyImage = useCallback(async () => {
    if (!blob) return;
    reportShare('copy');
    const outcome = await copyImageToClipboard(blob);
    if (outcome.ok) toast.success(t('journey.share.copied'));
    else toast.error(t('journey.share.failed'));
  }, [blob, reportShare, t]);

  const doCopyLink = useCallback(async () => {
    reportShare('copy-link');
    const outcome = await copyTextToClipboard(shareText);
    if (outcome.ok) toast.success(t('journey.share.linkCopied'));
    else toast.error(t('journey.share.failed'));
  }, [shareText, reportShare, t]);

  const doDownload = useCallback(() => {
    if (!blob) return;
    reportShare('download');
    downloadBlob(blob, filename);
  }, [blob, filename, reportShare]);

  // ============================================================
  // RETIRED — the verdict beat, before the card appears
  // ============================================================
  if (stage === 'retired') {
    return (
      <div className="p-6 space-y-5 text-center" data-testid="journey-retired">
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          // {t('journey.result.heading')}
        </div>

        <div>
          <div className="font-display text-2xl sm:text-3xl leading-tight text-primary"
               data-testid="journey-verdict">
            {verdictText}
          </div>
          <p className="text-sm text-foreground/85 mt-3 max-w-sm mx-auto leading-relaxed">
            {t(run.verdict.blurbKey, { region: String(run.chapters[0]?.vars.region ?? '') })}
          </p>
        </div>

        <div className="flex items-baseline justify-center gap-1.5">
          <span className="font-mono text-5xl font-bold text-primary" data-testid="journey-score">
            {run.score}
          </span>
          <span className="font-mono text-sm text-muted-foreground">/ 999</span>
        </div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {t('journey.result.scoreLabel')}
        </div>

        <Button onClick={onRevealCard} className="w-full font-mono text-xs font-bold h-11"
                data-testid="journey-reveal-card">
          <Sparkles size={13} className="mr-1.5" />
          {t('journey.share.heading')}
          <ArrowRight size={13} className="ml-1.5" />
        </Button>
      </div>
    );
  }

  // ============================================================
  // CARD — the shareable result screen
  // ============================================================
  return (
    <div className="p-4 space-y-4" data-testid="journey-card-screen">
      {/* ---- card preview ---- */}
      <div className="aspect-[4/5] w-full max-w-sm mx-auto rounded-md border overflow-hidden flex items-center justify-center"
           style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--muted))' }}>
        {busy ? (
          <div className="text-center">
            <Loader2 className="animate-spin text-primary mx-auto mb-2" size={26} />
            <div className="font-mono text-[10px] text-muted-foreground">{t('journey.result.rendering')}</div>
          </div>
        ) : error ? (
          <div className="text-center px-4">
            <div className="font-mono text-xs text-destructive mb-2">{t('journey.result.renderFailed')}</div>
            <Button onClick={render} size="sm" variant="outline" className="font-mono text-xs">
              {t('journey.result.retry')}
            </Button>
          </div>
        ) : url ? (
          <img src={url} alt={verdictText} className="w-full h-full object-contain"
               data-testid="journey-card-image" />
        ) : null}
      </div>

      {/* ---- share tiers ---- */}
      {blob && !busy && (
        <div className="space-y-2">
          {canShare && (
            <Button onClick={doWebShare} className="w-full font-mono text-xs font-bold h-11"
                    data-testid="journey-share-web">
              <Share2 size={13} className="mr-1.5" />
              {t('journey.share.web')}
            </Button>
          )}
          <div className="grid grid-cols-3 gap-2">
            <Button variant="outline" onClick={doCopyImage} className="font-mono text-[10px]"
                    data-testid="journey-share-copy">
              <Copy size={11} className="mr-1" />
              {t('journey.share.copyImage')}
            </Button>
            <Button variant="outline" onClick={doCopyLink} className="font-mono text-[10px]"
                    data-testid="journey-share-link">
              <Link2 size={11} className="mr-1" />
              {t('journey.share.copyLink')}
            </Button>
            <Button variant="outline" onClick={doDownload} className="font-mono text-[10px]"
                    data-testid="journey-share-download">
              <Download size={11} className="mr-1" />
              {t('journey.share.download')}
            </Button>
          </div>
        </div>
      )}

      {/* ---- CTA 1: builder handoff (the funnel a clone can't copy) ---- */}
      <button
        onClick={() => onBuilderHandoff(run)}
        data-testid="journey-cta-builder"
        className="w-full text-left rounded-md border p-3 transition hover:border-primary"
        style={{ borderColor: 'hsl(var(--primary)/0.45)', background: 'hsl(var(--primary)/0.06)' }}
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="font-mono text-xs font-semibold text-primary">
              <Wrench size={11} className="inline mr-1.5" />
              {t('journey.cta.builder')}
            </div>
            <div className="font-mono text-[10px] text-muted-foreground mt-0.5">
              {t('journey.cta.builderSub')}
            </div>
          </div>
          <ArrowRight size={14} className="shrink-0 text-primary" />
        </div>
      </button>

      {/* ---- CTA 2: merch print. Flag-gated — no dead buttons. ---- */}
      {isEnabled('JOURNEY_MERCH_CTA') && (
        <button
          onClick={() => { if (blob) onMerch(run, blob); }}
          disabled={!blob}
          data-testid="journey-cta-merch"
          className="w-full text-left rounded-md border p-3 transition hover:border-primary disabled:opacity-50"
          style={{ borderColor: 'hsl(var(--border))' }}
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="font-mono text-xs font-semibold">
                <ShoppingBag size={11} className="inline mr-1.5" />
                {t('journey.cta.merch')}
              </div>
              <div className="font-mono text-[10px] text-muted-foreground mt-0.5">
                {t('journey.cta.merchSub')}
              </div>
            </div>
            <ArrowRight size={14} className="shrink-0" />
          </div>
        </button>
      )}

      {/* ---- roster ---- */}
      <div>
        <div className="text-[10px] font-mono uppercase tracking-widest mb-1.5 text-muted-foreground">
          // {t('journey.result.roster')}
        </div>
        <div className="grid grid-cols-6 gap-1">
          {run.roster.map(entry => (
            <div key={entry.id} className="rounded border p-1 text-center"
                 style={{ borderColor: 'hsl(var(--border))' }}>
              <img src={pixelSprite(entry.id, entry.shiny)} alt="" width={40} height={40}
                   className="pixelated mx-auto" loading="lazy" />
              <div className="font-mono text-[8px] truncate text-muted-foreground">
                {rosterCaption(entry.id)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ---- score breakdown ---- */}
      <div>
        <div className="text-[10px] font-mono uppercase tracking-widest mb-1.5 text-muted-foreground">
          // {t('journey.result.breakdown')}
        </div>
        <div className="space-y-1">
          {run.breakdown.components.slice(0, 5).map(comp => (
            <div key={comp.key} className="flex items-center gap-2">
              <span className="font-mono text-[10px] w-28 shrink-0 text-muted-foreground truncate">
                {t(comp.label)}
              </span>
              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'hsl(var(--muted))' }}>
                <div className="h-full bg-primary"
                     style={{ width: `${Math.min(100, (comp.value / Math.max(1, run.breakdown.components[0].value)) * 100)}%` }} />
              </div>
              <span className="font-mono text-[10px] w-8 text-right">{comp.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ---- replay ---- */}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={onReplay} className="font-mono text-xs"
                data-testid="journey-replay">
          <RotateCcw size={12} className="mr-1.5" />
          {t('journey.result.replay')}
        </Button>
        <Button variant="outline" onClick={onNewJourney} className="font-mono text-xs"
                data-testid="journey-new">
          <Sparkles size={12} className="mr-1.5" />
          {t('journey.result.newSeed')}
        </Button>
      </div>

      <div className="font-mono text-[10px] text-muted-foreground text-center">
        {t('journey.result.seedLine', { seed: run.setup.seed })}
      </div>
    </div>
  );
}
