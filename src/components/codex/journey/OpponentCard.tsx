import { Swords, Crown, ShieldAlert, Users, Trophy } from 'lucide-react';
import { useI18n } from '@/i18n/useI18n';
import { pixelSprite } from '@/lib/pokemon';
import { rosterCaption, getRegion } from '@/journey/content';
import { TYPE_COLORS } from '@/lib/constants';
import type { Opponent } from '@/journey/opponents';
import type { Quest, RegionCrown, TravelOption } from '@/journey/types';
import { cn } from '@/lib/utils';

// ============================================================
// OPPONENT
// ============================================================

/**
 * The named adversary for this chapter.
 *
 * Every trainer here is ORIGINAL and procedurally generated (see
 * journey/opponents.ts) — no character from any Pokémon media appears in this
 * app. Showing the specialty and the party's edge is what turns team-building
 * into a decision with a visible payoff.
 */
export function OpponentCard({ opponent, advantage }: { opponent: Opponent; advantage: number }) {
  const { t } = useI18n();
  const colour = TYPE_COLORS[opponent.specialty] ?? 'hsl(var(--primary))';
  const Icon = opponent.kind === 'champion' ? Crown
    : opponent.kind === 'syndicate' ? ShieldAlert
    : opponent.kind === 'world-cup' ? Trophy
    : opponent.kind === 'elite-four' ? Users
    : Swords;

  const edge = advantage > 0.15 ? 'advantage' : advantage < -0.15 ? 'disadvantage' : 'even';

  return (
    <div className="rounded-md border px-2.5 py-2"
         style={{ borderColor: colour, background: `${colour}12` }}
         data-testid="journey-opponent">
      <div className="flex items-center gap-2">
        <Icon size={13} style={{ color: colour }} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[11px] font-semibold truncate"
               data-testid="journey-opponent-name">
            {t('journey.opponent.vs', { name: opponent.name })}
          </div>
          <div className="font-mono text-[9px] text-muted-foreground truncate">
            {opponent.title} · {t('journey.opponent.specialist', {
              type: opponent.specialty, level: opponent.level,
            })}
          </div>
          {opponent.ghost && (
            <div className="font-mono text-[9px] text-primary truncate" data-testid="journey-opponent-ghost">
              {t('journey.opponent.ghost', { score: opponent.ghost.score })}
            </div>
          )}
        </div>
        <div className="flex gap-0.5 shrink-0">
          {opponent.teamIds.slice(0, 4).map((id, i) => (
            <img key={`${id}-${i}`} src={pixelSprite(id)} alt={rosterCaption(id)}
                 title={rosterCaption(id)} width={22} height={22}
                 className="pixelated opacity-90" loading="lazy" decoding="async" />
          ))}
        </div>
      </div>
      <div className={cn(
        'font-mono text-[9px] mt-1',
        edge === 'advantage' ? 'text-emerald-500'
          : edge === 'disadvantage' ? 'text-destructive' : 'text-muted-foreground',
      )} data-testid="journey-opponent-edge">
        {t(`journey.opponent.${edge}`)}
      </div>
    </div>
  );
}

// ============================================================
// QUESTS
// ============================================================

export function QuestStrip({ quests }: { quests: Quest[] }) {
  const { t } = useI18n();
  if (!quests.length) return null;
  return (
    <div className="rounded-md border px-2.5 py-2"
         style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--card))' }}
         data-testid="journey-quests">
      <div className="font-mono text-[9px] uppercase tracking-wider text-primary mb-1.5">
        {t('journey.quest.heading')}
      </div>
      <div className="space-y-1">
        {quests.slice(0, 4).map(q => (
          <div key={q.id} className="flex items-center gap-2"
               data-testid={q.complete ? 'journey-quest-done' : 'journey-quest-open'}>
            <span className={cn(
              'font-mono text-[10px] truncate flex-1',
              q.complete ? 'text-emerald-500 line-through' : 'text-foreground/90',
            )} title={t(q.descKey)}>
              {t(q.titleKey)}
            </span>
            <span className="font-mono text-[9px] text-muted-foreground shrink-0">
              {t('journey.quest.progress', { n: q.progress, total: q.target })}
            </span>
            <div className="w-10 h-1 rounded-full overflow-hidden shrink-0"
                 style={{ background: 'hsl(var(--muted))' }}>
              <div className={cn('h-full', q.complete ? 'bg-emerald-500' : 'bg-primary/70')}
                   style={{ width: `${Math.round((q.progress / Math.max(1, q.target)) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// CROWNS
// ============================================================

export function CrownStrip({ crowns }: { crowns: RegionCrown[] }) {
  const { t } = useI18n();
  if (!crowns.length) return null;
  return (
    <div className="flex items-center gap-1.5 flex-wrap" data-testid="journey-crowns">
      <Crown size={11} className="text-yellow-400 shrink-0" />
      {crowns.map(c => (
        <span key={c.regionId}
              className="font-mono text-[9px] px-1.5 py-0.5 rounded border border-yellow-400/50 text-yellow-400">
          {t('journey.crown.earned', { region: getRegion(c.regionId).label })}
        </span>
      ))}
    </div>
  );
}

// ============================================================
// TRAVEL (the "go international" crossroads)
// ============================================================

export function TravelPicker({
  options, onTravel,
}: { options: TravelOption[]; onTravel: (regionId: string) => void }) {
  const { t } = useI18n();
  if (!options.length) return null;
  return (
    <div className="rounded-md border p-2.5"
         style={{ borderColor: 'hsl(var(--primary))', background: 'hsl(var(--primary)/0.06)' }}
         data-testid="journey-travel">
      <div className="font-mono text-[11px] font-semibold text-primary mb-0.5">
        {t('journey.travel.title')}
      </div>
      <p className="font-mono text-[9px] text-muted-foreground mb-2">
        {t('journey.travel.subtitle')}
      </p>
      <div className="space-y-1.5">
        {options.map(o => (
          <button
            key={o.regionId}
            onClick={() => onTravel(o.regionId)}
            data-testid={`journey-travel-${o.regionId}`}
            className="w-full text-left rounded border p-2 hover:border-primary hover:bg-primary/5 transition"
            style={{ borderColor: 'hsl(var(--border))' }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[11px] font-semibold">{o.label}</span>
              <div className="flex gap-0.5 shrink-0">
                {o.previewIds.map(id => (
                  <img key={id} src={pixelSprite(id)} alt="" width={20} height={20}
                       className="pixelated" loading="lazy" />
                ))}
              </div>
            </div>
            <div className="font-mono text-[9px] text-muted-foreground mt-0.5">
              {o.formLabel ? `${o.formLabel} · ` : ''}
              {t('journey.travel.legendaries', { n: o.legendaryCount })}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
