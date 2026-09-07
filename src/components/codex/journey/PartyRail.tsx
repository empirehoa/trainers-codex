import { useState } from 'react';
import { Star, BookMarked, Sparkles, Gift } from 'lucide-react';
import { useI18n } from '@/i18n/useI18n';
import { pixelSprite } from '@/lib/pokemon';
import { rosterCaption } from '@/journey/content';
import { canEvolve } from '@/journey/evolution';
import { cn } from '@/lib/utils';
import type { DexState, RosterEntry } from '@/journey/types';

interface Props {
  roster: RosterEntry[];
  dex: DexState;
  /** ids that can still evolve — glow those slots (from prepare availability). */
  evolvableIds?: number[];
}

/**
 * The persistent team-of-six strip. Rendered above every mid-run surface
 * (prepare, decision, recap) so the six the player is building is always in
 * view — the thing that makes decisions feel like they're about a real team.
 */
export function PartyRail({ roster, dex, evolvableIds }: Props) {
  const { t } = useI18n();
  const [dexOpen, setDexOpen] = useState(false);
  const evolvable = new Set(evolvableIds ?? roster.filter(m => canEvolve(m.id)).map(m => m.id));

  const slots: (RosterEntry | null)[] = Array.from({ length: 6 }, (_, i) => roster[i] ?? null);

  return (
    <div className="rounded-md border" style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--card))' }}
         data-testid="journey-party">
      <div className="flex items-center justify-between px-2.5 pt-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-primary">
          {t('journey.party.title')}
        </span>
        <button
          onClick={() => setDexOpen(o => !o)}
          data-testid="journey-dex-toggle"
          className="font-mono text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1 min-h-9 px-1 -mr-1"
        >
          <BookMarked size={10} />
          {t('journey.party.dexCount', { caught: dex.caught.length, seen: dex.seen.length })}
        </button>
      </div>

      <div className="grid grid-cols-6 gap-1 p-2">
        {slots.map((m, i) => (
          <div
            key={i}
            data-testid={m ? `journey-party-slot-${i}` : undefined}
            className={cn(
              'relative aspect-square rounded flex items-center justify-center',
              m ? 'border' : 'border border-dashed opacity-40',
            )}
            style={{
              borderColor: i === 0 && m ? 'hsl(var(--primary))' : 'hsl(var(--border))',
              background: m ? 'hsl(var(--muted)/0.25)' : 'transparent',
            }}
            title={m
              ? `${rosterCaption(m.id)}${m.shiny ? ' ★' : ''}${m.origin === 'event' ? ' (event)' : ''}`
              : undefined}
          >
            {m ? (
              <>
                <img src={pixelSprite(m.id, m.shiny)} alt={rosterCaption(m.id)} width={40} height={40}
                     className="pixelated w-full h-full object-contain p-0.5" loading="lazy" decoding="async" />
                {i === 0 && (
                  <span className="absolute -top-1 -left-1 bg-primary text-primary-foreground rounded-full p-0.5"
                        title={t('journey.party.ace')}>
                    <Star size={7} fill="currentColor" />
                  </span>
                )}
                {m.shiny && (
                  <Sparkles size={9} className="absolute top-0.5 right-0.5 text-yellow-400"
                            data-testid="journey-party-shiny" />
                )}
                {/* Event provenance is its own marker, not a reuse of the shiny
                    sparkle — the two used to be the same fact and a player had
                    no way to tell a shiny catch from a legendary encounter. */}
                {m.origin === 'event' && (
                  <Gift size={9}
                        className="absolute bottom-0.5 right-0.5 text-fuchsia-500 dark:text-fuchsia-400"
                        data-testid="journey-party-event" />
                )}
                {evolvable.has(m.id) && (
                  // NB: testid is deliberately NOT prefixed "journey-evolve-" —
                  // that prefix belongs to the prepare step's action buttons,
                  // and a shared prefix makes `[data-testid^="journey-evolve-"]`
                  // match this decorative marker too.
                  <span
                    className="absolute bottom-0 inset-x-0 h-1 rounded-b bg-emerald-400/80"
                    title={t('journey.party.evolveReady')}
                    data-testid="journey-party-evolvable"
                  />
                )}
              </>
            ) : (
              <span className="font-mono text-[10px] text-muted-foreground">–</span>
            )}
          </div>
        ))}
      </div>

      {dexOpen && (
        <div className="border-t px-2.5 py-2" style={{ borderColor: 'hsl(var(--border))' }} data-testid="journey-dex-grid">
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
            {t('journey.party.caughtHeading')} ({dex.caught.length})
          </div>
          <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto scroll-y">
            {dex.caught.map(id => (
              <img key={id} src={pixelSprite(id)} alt={rosterCaption(id)} title={rosterCaption(id)}
                   width={26} height={26} className="pixelated shrink-0" loading="lazy" decoding="async" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
