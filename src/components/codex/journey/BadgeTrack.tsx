import { useI18n } from '@/i18n/useI18n';
import { getRegion } from '@/journey/content';
import { BADGES_PER_REGION, type BadgeEarned, type RegionProgress, type Stake } from '@/journey/types';
import { cn } from '@/lib/utils';

interface Props {
  badges: BadgeEarned[];
  region: RegionProgress;
  stakes?: Stake[];
  score?: number;
}

/**
 * The gym-badge track — 8 slots for the region being toured, plus the region
 * tour position on a multi-region campaign, plus the current ante target.
 *
 * This is the "am I making progress" surface. Before it existed the career
 * counted badges invisibly, so a run read as one flat stretch of prose.
 */
export function BadgeTrack({ badges, region, stakes, score }: Props) {
  const { t } = useI18n();
  const here = badges.filter(b => b.regionId === region.regionId).length;
  const regionLabel = getRegion(region.regionId).label;
  const multiRegion = region.tour.length > 1;

  // The ante currently in play is the first uncleared one.
  const ante = stakes?.find(s => !s.cleared) ?? stakes?.[stakes.length - 1];

  return (
    <div className="rounded-md border px-2.5 py-2"
         style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--card))' }}
         data-testid="journey-badges">
      <div className="flex items-center justify-between mb-1.5 gap-2">
        <span className="font-mono text-[9px] uppercase tracking-wider text-primary truncate">
          {regionLabel}
          {multiRegion && (
            <span className="text-muted-foreground ml-1">
              {t('journey.region.tourPos', { n: region.tourIndex + 1, total: region.tour.length })}
            </span>
          )}
        </span>
        <span className="font-mono text-[9px] text-muted-foreground shrink-0"
              data-testid="journey-badge-count">
          {t('journey.region.badges', { n: here, total: BADGES_PER_REGION })}
        </span>
      </div>

      <div className="flex items-center gap-1">
        {Array.from({ length: BADGES_PER_REGION }, (_, i) => (
          <span
            key={i}
            data-testid={i < here ? 'journey-badge-earned' : undefined}
            title={t('journey.region.badgeN', { n: i + 1 })}
            className={cn(
              'flex-1 h-2.5 rounded-sm border transition',
              i < here ? 'bg-primary border-primary' : 'border-border',
            )}
            style={i < here ? undefined : { background: 'hsl(var(--muted)/0.4)' }}
          />
        ))}
      </div>

      {ante && (
        <div className="flex items-center justify-between mt-1.5 font-mono text-[9px]">
          <span className="text-muted-foreground" data-testid="journey-ante">
            {t('journey.stake.ante', { n: ante.ante })}
          </span>
          <span className={cn(score !== undefined && score >= ante.target ? 'text-emerald-500' : 'text-muted-foreground')}>
            {t('journey.stake.target', { n: ante.target })}
          </span>
        </div>
      )}
    </div>
  );
}
