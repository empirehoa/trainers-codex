import { useState, useEffect, useMemo, useRef } from 'react';
import { ShoppingBag, Download, ExternalLink, Loader2, Sparkles } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import type { TeamMember, TrainerProfile } from '@/lib/types';
import {
  MERCH_PRODUCTS, MERCH_SLOGANS, MARKUP_OPTIONS, buildVendorOrderUrl, computeRetail,
  sanitizeListingTitle,
  type MerchProduct, type MerchCategory
} from '@/lib/merch';
import { POKEMON_BY_ID } from '@/lib/pokemon';
import {
  renderMerchDesign, renderMerchPreview, MERCH_DESIGNS,
  BADGE_REGIONS, badgesForRegion,
  type MerchDesign
} from '@/lib/merch-renderers';
import { PremiumControl } from './PremiumControl';
import { isWorkerConfigured, submitPrintfulOrder } from '@/lib/license';
import { trackCommerce } from '@/lib/commerce-analytics';
import { cn } from '@/lib/utils';

interface MerchStudioDialogProps {
  open: boolean;
  onClose: () => void;
  team: (TeamMember | null)[];
  trainer: TrainerProfile | null;
  teamName: string;
  code: string;
  premium: boolean;
  onTogglePremium?: () => void;
}

const CATEGORY_LABELS: Record<MerchCategory, string> = {
  apparel: 'apparel',
  mug: 'drinkware',
  mousepad: 'desk',
  sticker: 'stickers',
  poster: 'prints',
  tote: 'bags',
  'phone-case': 'tech',
};

export function MerchStudioDialog({
  open, onClose, team, trainer, teamName, code, premium, onTogglePremium,
}: MerchStudioDialogProps) {
  const [selectedProduct, setSelectedProduct] = useState<MerchProduct>(MERCH_PRODUCTS[0]);
  const [design, setDesign] = useState<MerchDesign>('crest');
  const [gymName, setGymName] = useState<string>('');
  const [region, setRegion] = useState<string>('');
  const [badgeText, setBadgeText] = useState<string>('');
  const [badgeRegion, setBadgeRegion] = useState<string>('kanto');
  const [badges, setBadges] = useState<string[]>([]);
  const [year, setYear] = useState<string>(String(new Date().getFullYear()));
  const [markupPct, setMarkupPct] = useState<number>(100);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [printUrl, setPrintUrl] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const renderTokenRef = useRef(0);

  // Pre-fill region from trainer profile when dialog opens
  useEffect(() => {
    if (!open) return;
    if (trainer?.region && !region) setRegion(trainer.region.toUpperCase());
    if (trainer?.title && !badgeText) setBadgeText(trainer.title.toUpperCase());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Re-render mockup whenever inputs change (debounced)
  useEffect(() => {
    if (!open) return;
    const filled = team.filter(Boolean).length;
    if (filled === 0) return;

    const token = ++renderTokenRef.current;
    setRendering(true);
    setRenderError(null);
    const timer = setTimeout(async () => {
      try {
        const blob = await renderMerchPreview({
          team, trainer, teamName, code,
          product: selectedProduct,
          design,
          gymName: gymName || undefined,
          region: region || undefined,
          badgeText: badgeText || undefined,
          badgeRegion,
          badges,
          year: year ? parseInt(year, 10) : undefined,
          transparentBg: selectedProduct.category === 'apparel' || selectedProduct.category === 'tote' || selectedProduct.category === 'phone-case',
        });
        if (token !== renderTokenRef.current) return;
        const url = URL.createObjectURL(blob);
        setPreviewUrl(prev => { if (prev) URL.revokeObjectURL(prev); return url; });
      } catch (e) {
        if (token !== renderTokenRef.current) return;
        setRenderError(e instanceof Error ? e.message : 'render failed');
      } finally {
        if (token === renderTokenRef.current) setRendering(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [open, team, trainer, teamName, code, selectedProduct, design, gymName, region, badgeText, badgeRegion, badges, year]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (printUrl) URL.revokeObjectURL(printUrl);
  }, [previewUrl, printUrl]);

  const teamCount = team.filter(Boolean).length;
  const retail = computeRetail(selectedProduct.baseCostUSD, markupPct);
  const margin = retail - selectedProduct.baseCostUSD;

  // Legal bright-line: anything that becomes a public Printful listing title
  // must not carry the Pokémon trademark or a species name. We hold the full
  // species list here, so we sanitize free-text fragments before they leave
  // the browser; the worker applies a trademark backstop server-side.
  const speciesNames = useMemo(() => Object.values(POKEMON_BY_ID).map(p => p.display), []);
  const cleanListing = (raw: string | undefined): string | undefined => {
    const s = sanitizeListingTitle(raw, speciesNames);
    return s || undefined;
  };

  // Generate full-resolution print PNG on demand (download / order)
  const generatePrintBlob = async (): Promise<Blob | null> => {
    try {
      return await renderMerchDesign({
        team, trainer, teamName, code,
        product: selectedProduct,
        design,
        gymName: gymName || undefined,
        region: region || undefined,
        badgeText: badgeText || undefined,
        badgeRegion,
        badges,
        year: year ? parseInt(year, 10) : undefined,
        transparentBg: selectedProduct.category === 'apparel' || selectedProduct.category === 'tote' || selectedProduct.category === 'phone-case',
      });
    } catch (e) {
      setRenderError(e instanceof Error ? e.message : 'render failed');
      return null;
    }
  };

  const handleDownload = async () => {
    const blob = await generatePrintBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trainerscodex-${selectedProduct.id}-${design}-${code}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const [ordering, setOrdering] = useState(false);

  const handleOrder = async () => {
    trackCommerce({ event: 'merch_render_started', product: selectedProduct.id, design });
    const blob = await generatePrintBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    setPrintUrl(url);

    // Auto-download first so the user has the file ready locally regardless
    // of which order path runs.
    const a = document.createElement('a');
    a.href = url;
    a.download = `trainerscodex-${selectedProduct.id}-${design}-${code}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Real Printful API path: upload PNG to R2 via worker, create sync product,
    // open the resulting dashboard URL. Falls back to URL-deeplink if the
    // worker isn't configured (self-host deploys) or the API call fails.
    if (isWorkerConfigured() && selectedProduct.vendor === 'printful') {
      setOrdering(true);
      try {
        const result = await submitPrintfulOrder({
          productId: selectedProduct.id,
          design,
          markup: markupPct,
          metadata: {
            teamName: cleanListing(teamName),
            gymName: cleanListing(gymName),
            region: cleanListing(region),
            trainer: cleanListing(trainer?.name),
          },
          pngBlob: blob,
        });
        trackCommerce({
          event: 'merch_order_submitted', product: selectedProduct.id, design,
          valueUsd: parseFloat(result.retail) || 0,
        });
        toast.success(`Printful listing ready · ${result.productName}`);
        window.open(result.dashboardUrl, '_blank', 'noopener');
        return;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'printful order failed';
        toast.error(`${msg} · falling back to URL deeplink`);
        // Fall through to URL-deeplink path below
      } finally {
        setOrdering(false);
      }
    }

    // Fallback: URL deeplink. Open vendor's product page; user drag-drops
    // the downloaded PNG onto the vendor's design uploader.
    window.open(buildVendorOrderUrl(selectedProduct, url), '_blank', 'noopener');
  };

  // Filter products by category for the picker
  const productsByCategory = useMemo(() => {
    const groups: Record<string, MerchProduct[]> = {};
    for (const p of MERCH_PRODUCTS) {
      const key = CATEGORY_LABELS[p.category];
      (groups[key] ||= []).push(p);
    }
    return groups;
  }, []);

  // Printing is open to everyone — no design is premium-gated. (Merch is the
  // primary monetization path via POD markup; AI generation is the paid tier.)

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="font-mono text-xs uppercase tracking-widest flex items-center gap-2">
                <ShoppingBag size={14} />
                merch studio
              </DialogTitle>
              <DialogDescription className="font-mono text-[10px] uppercase tracking-wider">
                // {teamCount}/6 mons · {MERCH_PRODUCTS.length} products · {MERCH_DESIGNS.length} layouts · print-on-demand ready
              </DialogDescription>
            </div>
            <PremiumControl premium={premium} onTogglePremium={onTogglePremium} compact />
          </div>
        </DialogHeader>

        {teamCount === 0 ? (
          <div className="py-12 text-center font-mono text-xs text-muted-foreground">
            Add at least one Pokémon to your team to design merch.
          </div>
        ) : (
          <div className="grid md:grid-cols-[1fr_320px] gap-6">
            {/* ============ LEFT: PREVIEW + ORDER BUTTONS ============ */}
            <div>
              <div
                className="relative rounded-md border overflow-hidden"
                style={{
                  background: selectedProduct.category === 'apparel'
                    ? 'repeating-linear-gradient(45deg, #f8f8f8 0px, #f8f8f8 10px, #efefef 10px, #efefef 20px)'
                    : 'hsl(var(--card))',
                  aspectRatio: `${selectedProduct.printWidth} / ${selectedProduct.printHeight}`,
                  maxHeight: '60vh',
                }}
              >
                {rendering && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 z-10">
                    <Loader2 size={28} className="animate-spin text-primary" />
                  </div>
                )}
                {renderError && (
                  <div className="absolute inset-0 flex items-center justify-center text-red-500 font-mono text-xs p-4 text-center">
                    Render error: {renderError}
                  </div>
                )}
                {previewUrl && !renderError && (
                  <img
                    src={previewUrl}
                    alt={`${selectedProduct.label} preview`}
                    className="w-full h-full object-contain"
                  />
                )}
              </div>

              {/* Product + margin summary */}
              <div className="mt-3 p-3 rounded-md border bg-card">
                <div className="flex justify-between items-start gap-3 mb-2">
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">// selected product</div>
                    <div className="font-mono text-sm font-semibold">{selectedProduct.label}</div>
                    <div className="text-[11px] text-muted-foreground">{selectedProduct.blurb}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">// retail</div>
                    <div className="font-mono text-2xl font-bold text-primary">${retail.toFixed(2)}</div>
                    <div className="font-mono text-[10px] text-emerald-500">+${margin.toFixed(2)} margin</div>
                  </div>
                </div>

                <div className="flex gap-1.5 mt-2">
                  {MARKUP_OPTIONS.map(m => (
                    <button
                      key={m.pct}
                      onClick={() => setMarkupPct(m.pct)}
                      className={cn(
                        'flex-1 font-mono text-[10px] px-2 py-1 rounded border transition uppercase tracking-wider',
                        markupPct === m.pct ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground hover:border-primary'
                      )}
                      title={m.desc}
                    >
                      {m.label} +{m.pct}%
                    </button>
                  ))}
                </div>
                <div className="font-mono text-[10px] text-muted-foreground mt-1.5">
                  base cost ${selectedProduct.baseCostUSD.toFixed(2)} · markup {markupPct}% · vendor: {selectedProduct.vendor}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-3">
                <Button variant="outline" onClick={handleDownload} className="font-mono text-xs">
                  <Download size={12} className="mr-1.5" /> download print PNG
                </Button>
                <Button onClick={handleOrder} disabled={ordering} className="font-mono text-xs font-bold" data-testid="merch-order">
                  {ordering ? (
                    <><Loader2 size={12} className="mr-1.5 animate-spin" /> uploading…</>
                  ) : (
                    <><ExternalLink size={12} className="mr-1.5" /> order on {selectedProduct.vendor}</>
                  )}
                </Button>
              </div>
              <p className="text-[10px] font-mono text-muted-foreground mt-2 leading-relaxed">
                Clicking "order" downloads the print-ready file and opens {selectedProduct.vendor}.com.
                Drag the downloaded PNG onto their design uploader to complete the order.
                The print is {selectedProduct.printWidth}×{selectedProduct.printHeight}px at 300 DPI.
              </p>
            </div>

            {/* ============ RIGHT: CONTROLS ============ */}
            <div className="space-y-4">
              {/* Product picker */}
              <div>
                <Label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2 block">// product</Label>
                <div className="space-y-3 max-h-64 overflow-y-auto pr-1 scroll-y">
                  {Object.entries(productsByCategory).map(([cat, items]) => (
                    <div key={cat}>
                      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1">— {cat}</div>
                      <div className="space-y-1">
                        {items.map(p => {
                          const active = selectedProduct.id === p.id;
                          return (
                            <button
                              key={p.id}
                              onClick={() => setSelectedProduct(p)}
                              className={cn(
                                'w-full text-left p-2 rounded border transition',
                                active ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/60'
                              )}
                            >
                              <div className="flex justify-between items-center">
                                <span className="font-mono text-[11px] font-semibold">{p.label}</span>
                                <span className="font-mono text-[10px] text-emerald-500">${p.defaultRetailUSD.toFixed(2)}</span>
                              </div>
                              <div className="font-mono text-[10px] text-muted-foreground">base ${p.baseCostUSD.toFixed(2)} · {p.vendor}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Design picker */}
              <div>
                <Label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2 block">// design layout</Label>
                <div className="grid grid-cols-2 gap-1.5">
                  {MERCH_DESIGNS.map(d => {
                    const active = design === d.id;
                    return (
                      <button
                        key={d.id}
                        onClick={() => setDesign(d.id)}
                        title={d.desc}
                        className={cn(
                          'p-2 rounded border transition text-left relative',
                          active ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/60'
                        )}
                      >
                        <div className="font-mono text-[11px] font-semibold flex items-center gap-1">
                          {d.label}
                        </div>
                        <div className="font-mono text-[10px] text-muted-foreground leading-tight mt-0.5">{d.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <Separator />

              {/* Customization */}
              <div className="space-y-3">
                <Label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground block">// customize</Label>

                <div>
                  <Label htmlFor="gym-name" className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1 block">gym name</Label>
                  <Input
                    id="gym-name"
                    value={gymName}
                    onChange={(e) => setGymName(e.target.value)}
                    placeholder="e.g. Empire City Gym"
                    maxLength={28}
                    className="font-mono text-xs"
                  />
                </div>

                <div>
                  <Label htmlFor="merch-region" className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1 block">region / city</Label>
                  <Input
                    id="merch-region"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    placeholder="e.g. ORLANDO · FL"
                    maxLength={22}
                    className="font-mono text-xs"
                  />
                </div>

                <div>
                  <Label htmlFor="merch-badge" className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1 block">title / slogan</Label>
                  <Input
                    id="merch-badge"
                    value={badgeText}
                    onChange={(e) => setBadgeText(e.target.value)}
                    placeholder="e.g. GYM LEADER"
                    maxLength={26}
                    className="font-mono text-xs"
                  />
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {MERCH_SLOGANS.slice(0, 8).map(s => (
                      <button
                        key={s.id}
                        onClick={() => setBadgeText(s.text)}
                        className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:border-primary hover:text-primary transition"
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <Label htmlFor="merch-year" className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1 block">year (est.)</Label>
                  <Input
                    id="merch-year"
                    value={year}
                    onChange={(e) => setYear(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                    placeholder="2026"
                    className="font-mono text-xs"
                  />
                </div>

                {/* Gym-badge picker — only meaningful on the trainer-card layout */}
                {design === 'trainer-card' && (
                  <div className="pt-1">
                    <Label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1 block">gym badges · region</Label>
                    <div className="flex flex-wrap gap-1">
                      {BADGE_REGIONS.map(r => {
                        const active = badgeRegion === r.id;
                        return (
                          <button
                            key={r.id}
                            onClick={() => { setBadgeRegion(r.id); setBadges([]); }}
                            className={cn(
                              'font-mono text-[10px] px-1.5 py-0.5 rounded border transition',
                              active ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground hover:border-primary/60'
                            )}
                          >
                            {r.name} · {r.count}
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex items-center justify-between mt-2 mb-1">
                      <span className="font-mono text-[10px] text-muted-foreground">tap badges you've earned</span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => setBadges(badgesForRegion(badgeRegion).map(b => b.id))}
                          className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:border-primary hover:text-primary transition"
                        >all</button>
                        <button
                          onClick={() => setBadges([])}
                          className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:border-primary hover:text-primary transition"
                        >none</button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      {badgesForRegion(badgeRegion).map(b => {
                        const earned = badges.includes(b.id);
                        return (
                          <button
                            key={b.id}
                            onClick={() => setBadges(prev => prev.includes(b.id) ? prev.filter(x => x !== b.id) : [...prev, b.id])}
                            title={b.label}
                            className={cn(
                              'flex items-center gap-1.5 p-1.5 rounded border transition text-left',
                              earned ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/60 opacity-70'
                            )}
                          >
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ background: earned ? b.color : 'transparent', border: `1.5px solid ${b.color}` }}
                            />
                            <span className="min-w-0">
                              <span className="font-mono text-[10px] font-semibold block truncate">{b.label.split(' · ')[0]}</span>
                              <span className="font-mono text-[10px] text-muted-foreground block truncate">{b.label.split(' · ')[1] || ''}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <Separator />

              {/* Promo footer */}
              <div className="rounded-md bg-primary/5 border border-primary/20 p-2.5">
                <div className="flex items-start gap-2">
                  <Sparkles size={14} className="text-primary shrink-0 mt-0.5" />
                  <div className="font-mono text-[10px] leading-relaxed text-muted-foreground">
                    Every Trainer's Codex order ships from your POD vendor directly to the buyer.
                    You pay only base cost on fulfillment — the {markupPct}% markup is yours.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
