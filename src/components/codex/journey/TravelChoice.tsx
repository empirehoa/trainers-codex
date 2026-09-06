import { Plane } from 'lucide-react';
import { useI18n } from '@/i18n/useI18n';
import { pixelSprite } from '@/lib/pokemon';
import { rosterCaption } from '@/journey/content';
import type { TravelOption } from '@/journey/types';

interface Props {
  options: TravelOption[];
  onTravel: (regionId: string) => void;
}

/**
 * "Go international" — the crossroads after a region's Elite Four.
 *
 * Each option advertises what the region actually offers (its regional-form
 * line, how many legendaries are in its pool, a species preview) so travelling
 * is a real team-building decision rather than a coin flip.
 */
export function TravelChoice({ options, onTravel }: Props) {
  const { t } = useI18n();
  if (!options.length) return null;

  return (
    <div className="rounded-md border p-2.5" data-testid="journey-travel"
         style={{ borderColor: 'hsl(var(--primary))', background: 'hsl(var(--primary)/0.06)' }}>
      <div className="font-mono text-[10px] uppercase tracking-wider text-primary mb-1.5 flex items-center gap-1">
        <Plane size={11} /> {t('journey.travel.heading')}
      </div>
      <p className="font-mono text-[10px] text-muted-foreground mb-2">{t('journey.travel.sub')}</p>
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
              <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                {t('journey.travel.legendaries', { n: o.legendaryCount })}
              </span>
            </div>
            {o.formLabel && (
              <div className="font-mono text-[10px] text-emerald-500 mt-0.5">{o.formLabel}</div>
            )}
            <div className="flex gap-0.5 mt-1">
              {o.previewIds.map(id => (
                <img key={id} src={pixelSprite(id)} alt={rosterCaption(id)} title={rosterCaption(id)}
                     width={22} height={22} className="pixelated" loading="lazy" />
              ))}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
