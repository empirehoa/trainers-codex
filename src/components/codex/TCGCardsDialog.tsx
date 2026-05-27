import { useEffect, useState, useCallback } from 'react';
import { Loader2, ExternalLink, Search } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Pokemon } from '@/lib/types';
import { TYPE_COLORS } from '@/lib/constants';

interface TCGCard {
  id: string;
  name: string;
  number: string;
  rarity?: string;
  set: {
    id: string;
    name: string;
    series: string;
    releaseDate?: string;
  };
  images: {
    small: string;
    large: string;
  };
  artist?: string;
  hp?: string;
  types?: string[];
  cardmarket?: { url?: string; prices?: { averageSellPrice?: number; trendPrice?: number } };
  tcgplayer?: { url?: string; prices?: Record<string, { market?: number }> };
}

interface TCGCardsDialogProps {
  open: boolean;
  onClose: () => void;
  pokemon: Pokemon | null;
}

type FetchState = 'idle' | 'loading' | 'success' | 'error' | 'empty';

export function TCGCardsDialog({ open, onClose, pokemon }: TCGCardsDialogProps) {
  const [state, setState] = useState<FetchState>('idle');
  const [cards, setCards] = useState<TCGCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filterRarity, setFilterRarity] = useState<string>('');
  const [viewing, setViewing] = useState<TCGCard | null>(null);

  const fetchCards = useCallback(async (name: string) => {
    setState('loading');
    setError(null);
    try {
      const q = encodeURIComponent(`name:"${name}"`);
      // pokemontcg.io v2 public — works without an API key for low volume
      const url = `https://api.pokemontcg.io/v2/cards?q=${q}&pageSize=60&orderBy=-set.releaseDate`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const list: TCGCard[] = data.data || [];
      setCards(list);
      setState(list.length === 0 ? 'empty' : 'success');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'fetch failed');
      setState('error');
    }
  }, []);

  useEffect(() => {
    if (open && pokemon) {
      setViewing(null);
      setFilterRarity('');
      fetchCards(pokemon.display);
    }
  }, [open, pokemon, fetchCards]);

  const filteredCards = filterRarity
    ? cards.filter(c => (c.rarity || '').toLowerCase().includes(filterRarity.toLowerCase()))
    : cards;

  const rarities = Array.from(new Set(cards.map(c => c.rarity).filter(Boolean))) as string[];
  const primary = pokemon ? TYPE_COLORS[pokemon.types[0]] : '#f4ae3c';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl p-0 gap-0 max-h-[92vh] overflow-y-auto scroll-y bg-card">
        <DialogHeader className="px-4 py-3 border-b sticky top-0 bg-card z-10">
          <DialogTitle className="font-display text-lg lowercase" style={{ color: primary }}>
            tcg cards · {pokemon?.display.toLowerCase()}
          </DialogTitle>
          <DialogDescription className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            // live data from pokemontcg.io · click a card to expand
          </DialogDescription>
        </DialogHeader>

        <div className="p-4">
          {state === 'loading' && (
            <div className="py-16 flex flex-col items-center gap-3">
              <Loader2 className="animate-spin text-primary" size={24} />
              <div className="font-mono text-xs text-muted-foreground">searching for cards...</div>
            </div>
          )}

          {state === 'error' && (
            <div className="py-12 text-center">
              <div className="font-mono text-sm text-destructive mb-2">// search failed</div>
              <div className="font-mono text-xs text-muted-foreground mb-4">{error}</div>
              <Button onClick={() => pokemon && fetchCards(pokemon.display)} variant="outline" className="font-mono text-xs">
                <Search size={12} className="mr-1.5" /> retry
              </Button>
            </div>
          )}

          {state === 'empty' && (
            <div className="py-12 text-center font-mono text-xs text-muted-foreground">
              no cards found for {pokemon?.display}
            </div>
          )}

          {state === 'success' && (
            <>
              <div className="flex flex-wrap gap-1.5 mb-3">
                <button
                  onClick={() => setFilterRarity('')}
                  className={`text-[10px] font-mono px-2 py-1 rounded border ${!filterRarity ? 'border-primary text-primary' : 'border-border text-muted-foreground'}`}>
                  all · {cards.length}
                </button>
                {rarities.slice(0, 12).map(r => (
                  <button
                    key={r}
                    onClick={() => setFilterRarity(r)}
                    className={`text-[10px] font-mono px-2 py-1 rounded border ${filterRarity === r ? 'border-primary text-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}>
                    {r.toLowerCase()}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {filteredCards.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setViewing(c)}
                    className="text-left group transition"
                  >
                    <div className="aspect-[2.5/3.5] rounded-lg overflow-hidden border bg-muted relative shadow-lg"
                         style={{ borderColor: 'hsl(var(--border))' }}>
                      <img
                        src={c.images.small}
                        alt={c.name}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform"
                      />
                    </div>
                    <div className="mt-1.5 font-mono text-[10px]">
                      <div className="truncate text-foreground/80">{c.set.name}</div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>{c.number}</span>
                        {c.rarity && <span className="truncate">{c.rarity}</span>}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Card detail viewer */}
        {viewing && (
          <Dialog open={!!viewing} onOpenChange={(o) => { if (!o) setViewing(null); }}>
            <DialogContent className="max-w-md p-0 gap-0 bg-card">
              <DialogHeader className="px-4 py-3 border-b">
                <DialogTitle className="font-display text-base lowercase" style={{ color: primary }}>
                  {viewing.name} · {viewing.set.name}
                </DialogTitle>
                <DialogDescription className="text-[10px] font-mono">
                  {viewing.number} · {viewing.rarity || 'unknown rarity'} · {viewing.set.series}
                </DialogDescription>
              </DialogHeader>
              <div className="p-4 space-y-3">
                <div className="aspect-[2.5/3.5] rounded-lg overflow-hidden border bg-muted">
                  <img src={viewing.images.large} alt={viewing.name} className="w-full h-full object-cover" />
                </div>
                <div className="space-y-1.5 font-mono text-[11px]">
                  {viewing.artist && (
                    <div className="flex justify-between"><span className="text-muted-foreground">illustrator</span><span>{viewing.artist}</span></div>
                  )}
                  {viewing.set.releaseDate && (
                    <div className="flex justify-between"><span className="text-muted-foreground">released</span><span>{viewing.set.releaseDate}</span></div>
                  )}
                  {viewing.hp && (
                    <div className="flex justify-between"><span className="text-muted-foreground">hp</span><span>{viewing.hp}</span></div>
                  )}
                  {viewing.tcgplayer?.prices && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">tcgplayer market</span>
                      <span>${Object.values(viewing.tcgplayer.prices).map(p => p.market).filter(Boolean)[0]?.toFixed(2) || '—'}</span>
                    </div>
                  )}
                  {viewing.cardmarket?.prices?.averageSellPrice && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">cardmarket avg</span>
                      <span>€{viewing.cardmarket.prices.averageSellPrice.toFixed(2)}</span>
                    </div>
                  )}
                </div>
                {(viewing.tcgplayer?.url || viewing.cardmarket?.url) && (
                  <div className="flex gap-2">
                    {viewing.tcgplayer?.url && (
                      <Button asChild variant="outline" className="flex-1 font-mono text-xs">
                        <a href={viewing.tcgplayer.url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink size={11} className="mr-1.5" /> TCGplayer
                        </a>
                      </Button>
                    )}
                    {viewing.cardmarket?.url && (
                      <Button asChild variant="outline" className="flex-1 font-mono text-xs">
                        <a href={viewing.cardmarket.url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink size={11} className="mr-1.5" /> cardmarket
                        </a>
                      </Button>
                    )}
                  </div>
                )}
                <p className="font-mono text-[9px] text-muted-foreground text-center">
                  card data: pokemontcg.io · prices auto-pulled when available
                </p>
              </div>
            </DialogContent>
          </Dialog>
        )}

        <div className="p-3 border-t bg-background/50">
          <p className="text-[10px] font-mono text-muted-foreground text-center">
            <Badge variant="outline" className="font-mono text-[9px] mr-1">TCG</Badge>
            data via pokemontcg.io · for personal collection reference only
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
