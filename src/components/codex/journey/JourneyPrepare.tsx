import { useState } from 'react';
import {
  Wand2, Star, ChevronDown, ChevronUp, Undo2, Heart, Leaf, Candy, Gem, Link2,
  Share2, ArrowLeftRight, Lock, Pencil,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n/useI18n';
import { pixelSprite } from '@/lib/pokemon';
import { rosterCaption } from '@/journey/content';
import { evolutionsOf } from '@/journey/evolution';
import { xpProgress } from '@/journey/levels';
import {
  ITEMS, ITEM_IDS, inventoryCount, type ItemId, type Inventory,
} from '@/journey/items';
import { cn } from '@/lib/utils';
import type { PrepareAction, PrepareAvailability, RosterEntry } from '@/journey/types';

interface Props {
  chapterIndex: number;
  roster: RosterEntry[];
  prepare: PrepareAvailability;
  inventory: Inventory;
  actionsThisChapter: number;
  onAction: (action: PrepareAction) => void;
  onUndoPrep: () => void;
}

const ITEM_ICON: Record<ItemId, typeof Heart> = {
  'soothe-bell': Heart,
  'energy-root': Leaf,
  'rare-candy': Candy,
  'evo-stone': Gem,
  'link-cord': Link2,
  'exp-share': Share2,
};

/**
 * The prepare step. Collapsed by default so the short-run rhythm survives, but
 * one tap opens real agency over the six: level-gated evolution, item use,
 * ace promotion, and swapping a member out for anything in the box.
 */
export function JourneyPrepare({
  chapterIndex, roster, prepare, inventory, actionsThisChapter, onAction, onUndoPrep,
}: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [swapFor, setSwapFor] = useState<number | null>(null);
  const [nickFor, setNickFor] = useState<number | null>(null);
  const [nickDraft, setNickDraft] = useState('');

  const evolveById = new Map(prepare.evolves.map(e => [e.fromId, e]));
  const items = inventoryCount(inventory);
  const box = prepare.box ?? [];

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
          {box.length > 0 && (
            <span className="font-mono text-[9px] text-muted-foreground">
              {t('journey.prepare.box')}: {box.length}
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
            const prog = xpProgress(m.xp ?? 0);
            return (
              <div key={`${m.id}-${i}`} className="rounded border p-2"
                   style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--muted)/0.2)' }}
                   data-testid={`journey-member-${m.id}`}>
                <div className="flex items-center gap-2">
                  <img src={pixelSprite(m.id, m.shiny)} alt={rosterCaption(m.id)} width={30} height={30}
                       className="pixelated shrink-0" loading="lazy" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[11px] truncate">
                        {m.nickname
                          ? <><span className="text-primary">{m.nickname}</span>
                              <span className="text-muted-foreground"> ({rosterCaption(m.id)})</span></>
                          : rosterCaption(m.id)}{m.shiny ? ' ★' : ''}
                      </span>
                      <button
                        onClick={() => {
                          setNickFor(nickFor === m.id ? null : m.id);
                          setNickDraft(m.nickname ?? '');
                        }}
                        data-testid={`journey-nick-open-${m.id}`}
                        title={t('journey.prepare.nickname')}
                        className="shrink-0 text-muted-foreground hover:text-primary"
                      >
                        <Pencil size={9} />
                      </button>
                      <span className="font-mono text-[9px] text-primary shrink-0"
                            data-testid={`journey-level-${m.id}`}>
                        {t('journey.prepare.lv', { n: prog.level })}
                      </span>
                    </div>
                    {/* XP bar — the party visibly grows every chapter. */}
                    <div className="h-1 mt-1 rounded-full overflow-hidden" style={{ background: 'hsl(var(--muted))' }}>
                      <div className="h-full bg-primary/70" style={{ width: `${Math.round(prog.pct * 100)}%` }} />
                    </div>
                  </div>
                  {i === 0 ? (
                    <span className="font-mono text-[9px] text-primary flex items-center gap-0.5 shrink-0">
                      <Star size={9} fill="currentColor" /> {t('journey.prepare.isAce')}
                    </span>
                  ) : (
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => onAction({ type: 'ace', chapterIndex, id: m.id })}
                      data-testid={`journey-setace-${m.id}`}
                      className="h-6 px-2 font-mono text-[9px] shrink-0"
                    >
                      <Star size={9} className="mr-1" />{t('journey.prepare.setAce')}
                    </Button>
                  )}
                </div>

                {/* Evolution — only rendered for species that actually evolve. */}
                {offer && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {offer.options.map(opt => (
                      <button
                        key={opt.id}
                        disabled={!opt.ready}
                        onClick={() => onAction({
                          type: 'evolve', chapterIndex, fromId: m.id, toId: opt.id,
                          viaItem: opt.how === 'item' || opt.how === 'trade',
                        })}
                        data-testid={`journey-evolve-${m.id}-${opt.id}`}
                        className={cn(
                          'font-mono text-[9px] px-2 py-1 rounded border transition flex items-center gap-1',
                          opt.ready
                            ? 'border-emerald-500/60 text-emerald-500 hover:bg-emerald-500/10'
                            : 'opacity-50 cursor-not-allowed border-border text-muted-foreground',
                        )}
                        title={opt.ready
                          ? t('journey.prepare.evolveInto', { name: opt.to })
                          : t(opt.blockKey ?? 'journey.prepare.evolveLocked', { n: opt.blockValue ?? 0 })}
                      >
                        {opt.ready ? <Wand2 size={9} /> : <Lock size={9} />}
                        {opt.to}
                        {!opt.ready && opt.blockKey && (
                          <span className="opacity-80">
                            · {t(opt.blockKey, { n: opt.blockValue ?? 0 })}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {!offer && fullyEvolved && (
                  <div className="font-mono text-[9px] text-muted-foreground mt-1">
                    {t('journey.prepare.fullyEvolved')}
                  </div>
                )}

                {nickFor === m.id && (
                  <form
                    className="flex gap-1 mt-1.5"
                    data-testid={`journey-nick-form-${m.id}`}
                    onSubmit={e => {
                      e.preventDefault();
                      onAction({ type: 'nickname', chapterIndex, id: m.id, name: nickDraft });
                      setNickFor(null);
                    }}
                  >
                    <input
                      value={nickDraft}
                      onChange={e => setNickDraft(e.target.value)}
                      maxLength={14}
                      autoFocus
                      placeholder={rosterCaption(m.id)}
                      data-testid={`journey-nick-input-${m.id}`}
                      className="flex-1 min-w-0 font-mono text-[10px] px-2 py-1 rounded border bg-transparent"
                      style={{ borderColor: 'hsl(var(--border))' }}
                    />
                    <button type="submit" data-testid={`journey-nick-save-${m.id}`}
                            className="font-mono text-[9px] px-2 py-1 rounded border border-primary/50 text-primary hover:bg-primary/10">
                      {t('journey.prepare.nickSave')}
                    </button>
                  </form>
                )}

                {/* Swap this member out for something in the box. */}
                {box.length > 0 && (
                  <div className="mt-1.5">
                    <button
                      onClick={() => setSwapFor(swapFor === m.id ? null : m.id)}
                      data-testid={`journey-swap-open-${m.id}`}
                      className="font-mono text-[9px] px-2 py-1 rounded border border-border text-muted-foreground hover:text-primary hover:border-primary/50 flex items-center gap-1"
                    >
                      <ArrowLeftRight size={9} />
                      {t('journey.prepare.swap')}
                    </button>
                    {swapFor === m.id && (
                      <div className="flex flex-wrap gap-1 mt-1 p-1.5 rounded border"
                           style={{ borderColor: 'hsl(var(--border))' }}
                           data-testid={`journey-swap-panel-${m.id}`}>
                        {box.map(b => (
                          <button
                            key={b.id}
                            onClick={() => {
                              onAction({ type: 'swap', chapterIndex, outId: m.id, inId: b.id });
                              setSwapFor(null);
                            }}
                            data-testid={`journey-swap-${m.id}-${b.id}`}
                            title={`${rosterCaption(b.id)} · ${t('journey.prepare.lv', { n: xpProgress(b.xp).level })}`}
                            className="flex flex-col items-center p-1 rounded hover:bg-primary/10 border border-transparent hover:border-primary/40"
                          >
                            <img src={pixelSprite(b.id, b.shiny)} alt={rosterCaption(b.id)}
                                 width={26} height={26} className="pixelated" loading="lazy" />
                            <span className="font-mono text-[8px] text-muted-foreground">
                              {xpProgress(b.xp).level}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
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
                {ITEM_IDS.filter(id => (inventory[id] ?? 0) > 0).map(id => {
                  const Icon = ITEM_ICON[id];
                  // Stones and cords are spent by the evolution they unlock,
                  // so they're shown as held resources rather than buttons.
                  const passive = id === 'evo-stone' || id === 'link-cord';
                  if (passive) {
                    return (
                      <span key={id}
                            className="font-mono text-[9px] px-2 py-1 rounded border border-dashed border-border text-muted-foreground flex items-center gap-1"
                            title={t(ITEMS[id].descKey)}>
                        <Icon size={10} />{t(ITEMS[id].nameKey)} ×{inventory[id]}
                      </span>
                    );
                  }
                  return (
                    <button
                      key={id}
                      onClick={() => onAction({
                        type: 'item', chapterIndex, item: id,
                        targetId: ITEMS[id].targeted ? roster[0]?.id : undefined,
                      })}
                      data-testid={`journey-item-${id}`}
                      className="font-mono text-[9px] px-2 py-1 rounded border border-primary/50 text-primary hover:bg-primary/10 flex items-center gap-1"
                      title={t(ITEMS[id].descKey)}
                    >
                      <Icon size={10} />
                      {t(ITEMS[id].nameKey)} ×{inventory[id]}
                    </button>
                  );
                })}
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
