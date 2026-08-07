import { useState } from 'react';
import {
  Wand2, Star, ChevronDown, ChevronUp, Undo2, Heart, Leaf, Candy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n/useI18n';
import { pixelSprite } from '@/lib/pokemon';
import { rosterCaption } from '@/journey/content';
import { evolutionsOf } from '@/journey/evolution';
import { ITEMS, ITEM_IDS, inventoryCount, type ItemId, type Inventory } from '@/journey/items';
import { cn } from '@/lib/utils';
import type { PrepareAction, PrepareAvailability, RosterEntry } from '@/journey/types';

interface Props {
  chapterIndex: number;
  roster: RosterEntry[];
  prepare: PrepareAvailability;
  inventory: Inventory;
  /** How many prepare-actions the player has taken at THIS chapter (for undo). */
  actionsThisChapter: number;
  onAction: (action: PrepareAction) => void;
  onUndoPrep: () => void;
}

const ITEM_ICON: Record<ItemId, typeof Heart> = {
  'soothe-bell': Heart,
  'energy-root': Leaf,
  'rare-candy': Candy,
};

/**
 * The prepare step, rendered above the decision options. Collapsed by default
 * so the 3-minute rhythm survives, but one tap opens real agency over the six:
 * evolve eligible members (or spend a Rare Candy to go early), spend bond/
 * fatigue items, and promote any member to ace.
 */
export function JourneyPrepare({
  chapterIndex, roster, prepare, inventory, actionsThisChapter, onAction, onUndoPrep,
}: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  const evolveById = new Map(prepare.evolves.map(e => [e.fromId, e]));
  const candies = inventory['rare-candy'] ?? 0;
  const items = inventoryCount(inventory);

  return (
    <div className="rounded-md border" style={{ borderColor: 'hsl(var(--border))' }} data-testid="journey-prepare">
      <button
        onClick={() => setOpen(o => !o)}
        data-testid="journey-prepare-toggle"
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-primary/5 rounded-md"
      >
        <span className="font-mono text-[11px] font-semibold text-primary flex items-center gap-1.5">
          <Wand2 size={12} />
          {t('journey.prepare.title')}
        </span>
        <span className="flex items-center gap-2">
          {items > 0 && (
            <span className="font-mono text-[9px] text-muted-foreground">
              {t('journey.prepare.items')}: {items}
            </span>
          )}
          {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2">
          <p className="font-mono text-[9px] text-muted-foreground">{t('journey.prepare.subtitle')}</p>

          {roster.map((m, i) => {
            const offer = evolveById.get(m.id);
            const fullyEvolved = evolutionsOf(m.id).length === 0;
            return (
              <div key={`${m.id}-${i}`} className="rounded border p-2"
                   style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--muted)/0.2)' }}>
                <div className="flex items-center gap-2">
                  <img src={pixelSprite(m.id, m.shiny)} alt={rosterCaption(m.id)} width={30} height={30}
                       className="pixelated shrink-0" loading="lazy" />
                  <span className="font-mono text-[11px] truncate flex-1">
                    {rosterCaption(m.id)}{m.shiny ? ' ★' : ''}
                  </span>
                  {i === 0 ? (
                    <span className="font-mono text-[9px] text-primary flex items-center gap-0.5">
                      <Star size={9} fill="currentColor" /> {t('journey.prepare.isAce')}
                    </span>
                  ) : (
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => onAction({ type: 'ace', chapterIndex, id: m.id })}
                      data-testid={`journey-setace-${m.id}`}
                      className="h-6 px-2 font-mono text-[9px]"
                    >
                      <Star size={9} className="mr-1" />{t('journey.prepare.setAce')}
                    </Button>
                  )}
                </div>

                {/* Evolution controls */}
                {offer && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {offer.options.map(opt => {
                      const gated = !offer.eligible;
                      const canCandy = gated && candies > 0;
                      const disabled = gated && !canCandy;
                      return (
                        <button
                          key={opt.id}
                          disabled={disabled}
                          onClick={() => onAction({
                            type: 'evolve', chapterIndex, fromId: m.id, toId: opt.id,
                            viaItem: gated,
                          })}
                          data-testid={`journey-evolve-${m.id}-${opt.id}`}
                          className={cn(
                            'font-mono text-[9px] px-2 py-1 rounded border transition flex items-center gap-1',
                            disabled
                              ? 'opacity-40 cursor-not-allowed border-border'
                              : 'border-emerald-500/50 text-emerald-500 hover:bg-emerald-500/10',
                          )}
                          title={gated
                            ? (canCandy ? t('journey.prepare.candyEvolve') : t('journey.prepare.evolveLocked'))
                            : t('journey.prepare.evolveInto', { name: opt.to })}
                        >
                          <Wand2 size={9} />
                          {opt.to}
                          {canCandy && <Candy size={9} className="ml-0.5" />}
                        </button>
                      );
                    })}
                  </div>
                )}
                {!offer && fullyEvolved && (
                  <div className="font-mono text-[9px] text-muted-foreground mt-1">
                    {t('journey.prepare.fullyEvolved')}
                  </div>
                )}
              </div>
            );
          })}

          {/* Items */}
          <div className="pt-1">
            <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground mb-1">
              {t('journey.prepare.items')}
            </div>
            {items === 0 ? (
              <p className="font-mono text-[9px] text-muted-foreground">{t('journey.prepare.noItems')}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {ITEM_IDS.filter(id => id !== 'rare-candy' && (inventory[id] ?? 0) > 0).map(id => {
                  const Icon = ITEM_ICON[id];
                  return (
                    <button
                      key={id}
                      onClick={() => onAction({ type: 'item', chapterIndex, item: id })}
                      data-testid={`journey-item-${id}`}
                      className="font-mono text-[9px] px-2 py-1 rounded border border-primary/50 text-primary hover:bg-primary/10 flex items-center gap-1"
                      title={t(ITEMS[id].descKey)}
                    >
                      <Icon size={10} />
                      {t(ITEMS[id].nameKey)} ×{inventory[id]}
                    </button>
                  );
                })}
                {candies > 0 && (
                  <span className="font-mono text-[9px] px-2 py-1 rounded border border-dashed border-border text-muted-foreground flex items-center gap-1"
                        title={t('journey.item.rare-candy.desc')}>
                    <Candy size={10} />
                    {t('journey.item.rare-candy.name')} ×{candies}
                  </span>
                )}
              </div>
            )}
          </div>

          {actionsThisChapter > 0 && (
            <Button variant="ghost" size="sm" onClick={onUndoPrep}
                    data-testid="journey-undo-prep"
                    className="w-full h-7 font-mono text-[9px] text-muted-foreground hover:text-primary">
              <Undo2 size={10} className="mr-1.5" />
              {t('journey.prepare.undoPrep')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
