import { Keyboard, Info, HelpCircle, Sparkles, Wand2, Gamepad2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';

interface HelpDialogProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { keys: ['/'], desc: 'focus search' },
  { keys: ['Esc'], desc: 'close any modal' },
  { keys: ['?'], desc: 'open this help' },
  { keys: ['⌘', 'Z'], desc: 'undo team change' },
];

const FAQS = [
  { q: 'Why include legendaries, mythicals, and paradox Pokémon?', a: 'v4 adds all 1025 mons including legendaries, mythicals, Ultra Beasts, and Paradox forms — filter by category in the search panel. Coverage analysis treats them like any other team member. If you only want playable-in-cup mons, set the category filter to "normal."' },
  { q: 'How do shinies work?', a: 'Each team member has an independent shiny flag — the same Pokémon can be shiny in one team and not in another. Toggle it from the per-Pokémon configure dialog. Shiny status is encoded in the share URL (e.g. "6s-9-3") and saved with each team.' },
  { q: 'Can I pick custom movesets?', a: 'Yes — open the configure dialog from the team bar (click the gear icon on any slot). Each Pokémon has its full PokeAPI learnset available — usually 50–100 moves. Pick up to 4, filter by damaging/status/STAB-only, or hit auto-fill for a sensible default.' },
  { q: 'What about TCG cards?', a: 'Click the TCG button in the Pokémon detail dialog or analysis sheet to pull live card data from pokemontcg.io. You get card images, set/rarity info, illustrator credit, and current market prices from TCGplayer & Cardmarket when available.' },
  { q: 'How does game compatibility work?', a: 'The analysis sheet shows which of the 6 Switch-era mainline games your team can run in (Let\'s Go, Sword/Shield, BDSP, Legends Arceus, Scarlet/Violet, Legends Z-A). If your team isn\'t fully playable in any single game, it recommends the closest match and explains how to transfer through Pokémon HOME 4.0.' },
  { q: 'What is the poster studio?', a: '12 art styles render your team as a 1080×1350 PNG ready for Instagram or print: CRT terminal, pixel grid, editorial, Game Boy, arcade cabinet, polaroid, sticker sheet, trading card, plus the new v5 set — Holographic Foil, Blueprint, Grainy Cinema, and Type Collage. Your trainer profile is embedded.' },
  { q: 'What does premium unlock?', a: '4 premium poster styles (editorial, arcade, TCG sheet, stickers) and 3D HOME sprites in the configure dialog. There\'s a preview-unlock toggle inside the poster studio for development; a real plan will be $4.99/mo via Stripe.' },
  { q: 'Is my data stored anywhere?', a: 'All teams, trainer profile, and premium status stay on your device via localStorage. Nothing is sent to a server. TCG card data is fetched live from pokemontcg.io when you open the cards dialog. Export to JSON anytime for backup.' },
  { q: 'Who runs this?', a: "Trainer's Codex is an independent fan tool. Pokémon, character names, and sprites are trademarks of Nintendo / Game Freak / The Pokémon Company. Not affiliated." },
];

export function HelpDialog({ open, onClose }: HelpDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md p-0 gap-0 max-h-[90dvh] overflow-y-auto scroll-y bg-card">
        <DialogHeader className="px-4 py-3 border-b sticky top-0 bg-card z-10">
          <DialogTitle className="font-display text-lg text-primary lowercase">help & about</DialogTitle>
          <DialogDescription className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            // trainer's codex v5.0
          </DialogDescription>
        </DialogHeader>

        <div className="p-4 space-y-5">
          <section>
            <SectionHeading icon={<Sparkles size={13} />} title="what's new in v4" />
            <ul className="mt-2 space-y-1.5 text-xs font-mono">
              <li className="text-muted-foreground">· <span className="text-foreground">1307 Pokémon &amp; forms</span> — all gens + megas, regionals, gigantamax</li>
              <li className="text-muted-foreground">· <span className="text-foreground">Shiny variants</span> with full sprite support</li>
              <li className="text-muted-foreground">· <span className="text-foreground">Custom movesets</span> from full PokeAPI learnsets</li>
              <li className="text-muted-foreground">· <span className="text-foreground">TCG card lookup</span> per Pokémon (live pokemontcg.io)</li>
              <li className="text-muted-foreground">· <span className="text-foreground">Game compatibility</span> check for all Switch-era games</li>
              <li className="text-muted-foreground">· <span className="text-foreground">Trainer profile</span> — name, avatar, signature mon</li>
              <li className="text-muted-foreground">· <span className="text-foreground">Poster studio</span> — 12 art styles, IG-ready, print-on-demand</li>
            </ul>
          </section>

          <Separator />

          <section>
            <SectionHeading icon={<Keyboard size={13} />} title="keyboard" />
            <div className="mt-2 space-y-1.5">
              {SHORTCUTS.map((s, i) => (
                <div key={i} className="flex items-center justify-between font-mono text-xs">
                  <div className="flex gap-1">
                    {s.keys.map((k, j) => (
                      <kbd key={j} className="px-1.5 py-0.5 rounded border text-[10px]"
                           style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--muted))', color: 'hsl(var(--primary))' }}>
                        {k}
                      </kbd>
                    ))}
                  </div>
                  <span className="text-muted-foreground">{s.desc}</span>
                </div>
              ))}
            </div>
          </section>

          <Separator />

          <section>
            <SectionHeading icon={<Info size={13} />} title="how to use" />
            <ul className="mt-2 space-y-1.5 text-xs font-mono">
              <li className="text-muted-foreground">· <span className="text-foreground">Search</span> by name or pokédex #</li>
              <li className="text-muted-foreground">· <span className="text-foreground">Filter</span> by type, generation, role, or category</li>
              <li className="text-muted-foreground">· <span className="text-foreground">Add up to 6</span> Pokémon to your team</li>
              <li className="text-muted-foreground">· <span className="text-foreground">Click a team slot</span> to configure shiny, moves, ability, nickname</li>
              <li className="text-muted-foreground">· <span className="text-foreground">Analyze</span> for threats, coverage, counter teams, and game compat</li>
              <li className="text-muted-foreground">· <span className="text-foreground"><Wand2 size={9} className="inline" /> Poster Studio</span> generates shareable images in 8 styles</li>
              <li className="text-muted-foreground">· <span className="text-foreground"><Gamepad2 size={9} className="inline" /> Game compat</span> tells you where to transfer via HOME</li>
            </ul>
          </section>

          <Separator />

          <section>
            <SectionHeading icon={<HelpCircle size={13} />} title="faq" />
            <div className="mt-2 space-y-3">
              {FAQS.map((f, i) => (
                <div key={i}>
                  <div className="font-mono text-xs font-semibold mb-1 text-primary">{f.q}</div>
                  <div className="font-mono text-[11px] leading-relaxed text-muted-foreground">{f.a}</div>
                </div>
              ))}
            </div>
          </section>

          <Separator />

          <section>
            <div className="text-[10px] font-mono uppercase tracking-widest mb-2 text-muted-foreground">// credits</div>
            <p className="text-[11px] font-mono leading-relaxed">
              Sprite art & base data from{' '}
              <a href="https://pokeapi.co" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                PokéAPI
              </a>
              . TCG card data from{' '}
              <a href="https://pokemontcg.io" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                pokemontcg.io
              </a>
              . Stats, types, abilities, learnsets, and species flags reflect canonical game data.
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SectionHeading({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <div className="self-center text-primary">{icon}</div>
      <h3 className="font-display text-sm text-primary">{title}</h3>
    </div>
  );
}
