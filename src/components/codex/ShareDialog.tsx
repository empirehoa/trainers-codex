import { useState, useMemo } from 'react';
import { Copy, Check, ExternalLink, Wand2, Share2 } from 'lucide-react';
import { canShareLink, shareLink } from '@/lib/share';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { Pokemon, TeamMember, TrainerProfile } from '@/lib/types';
import { buildShareCode, showdownExport } from '@/lib/analysis';
import { MOVES_BY_ID } from '@/lib/pokemon';

interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  team: (Pokemon | null)[];
  members: (TeamMember | null)[];
  teamName: string;
  trainer: TrainerProfile | null;
  premium: boolean;
  onOpenPosterStudio: () => void;
}

export function ShareDialog({
  open, onClose, team, members, teamName, trainer, onOpenPosterStudio
}: ShareDialogProps) {
  const filled = team.filter(Boolean) as Pokemon[];
  const code = useMemo(() => buildShareCode(members), [members]);
  // The shareable link uses `#team=` (not the app's own `#t=` resume hash) so a
  // recipient lands on a "someone shared a team with you" page — with the team
  // name and sharer carried along — instead of silently loading it in. App.tsx
  // parses `#team=` on boot and shows SharedTeamLanding.
  const shareUrl = useMemo(() => {
    const extra =
      (teamName ? `&tn=${encodeURIComponent(teamName)}` : '') +
      (trainer?.name ? `&by=${encodeURIComponent(trainer.name)}` : '');
    try { return `${window.location.origin}${window.location.pathname}#team=${code}${extra}`; }
    catch { return `#team=${code}${extra}`; }
  }, [code, teamName, trainer]);
  const teamText = useMemo(() => {
    const ownerLine = trainer?.name ? `${trainer.name}${trainer.title ? ` (${trainer.title})` : ''}'s` : 'My';
    const header = teamName
      ? `${ownerLine} Trainer's Codex Team — "${teamName}":`
      : `${ownerLine} Trainer's Codex Team:`;
    const lines = filled.map((p, i) => {
      const m = members.find(x => x?.id === p.id);
      const shiny = m?.shiny ? ' ⭐' : '';
      const name = m?.nickname ? `${m.nickname} the ${p.display}` : p.display;
      return `${i + 1}. ${name}${shiny} (${p.types.join('/')}) — BST ${p.bst}`;
    });
    const motto = trainer?.motto ? [`"${trainer.motto}"`, ''] : [];
    return [header, '', ...lines, '', ...motto, `Code: ${code}`, `Build yours: ${shareUrl}`].join('\n');
  }, [filled, members, code, teamName, shareUrl, trainer]);
  const showdownText = useMemo(() => showdownExport(team, members, MOVES_BY_ID), [team, members]);

  const [copied, setCopied] = useState<string | null>(null);

  const copyText = async (val: string, key: string) => {
    try {
      await navigator.clipboard.writeText(val);
      setCopied(key);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopied('error');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md p-0 gap-0 max-h-[92dvh] overflow-y-auto scroll-y bg-card">
        <DialogHeader className="px-4 py-3 border-b sticky top-0 bg-card z-10">
          <DialogTitle className="font-display text-lg text-primary lowercase">share team</DialogTitle>
          <DialogDescription className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            // {filled.length} member{filled.length === 1 ? '' : 's'} · code: {code}
          </DialogDescription>
        </DialogHeader>

        <div className="p-4">
          <Tabs defaultValue="link" className="w-full">
            <TabsList className="grid grid-cols-3 mb-4 bg-muted">
              <TabsTrigger value="link" className="font-mono text-[10px] uppercase">link</TabsTrigger>
              <TabsTrigger value="text" className="font-mono text-[10px] uppercase">text</TabsTrigger>
              <TabsTrigger value="showdown" className="font-mono text-[10px] uppercase">showdown</TabsTrigger>
            </TabsList>

            <TabsContent value="link" className="space-y-2">
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">// shareable url · encodes shinies</div>
              <div className="flex gap-2">
                <Input readOnly value={shareUrl} className="font-mono text-xs text-primary"
                       onClick={(e) => (e.target as HTMLInputElement).select()} />
                <Button variant="outline" onClick={() => copyText(shareUrl, 'url')} className="font-mono text-xs">
                  {copied === 'url' ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                  <span className="ml-1.5">{copied === 'url' ? 'copied' : 'copy'}</span>
                </Button>
              </div>
              {canShareLink() && (
                <Button
                  onClick={() => shareLink({
                    title: "Trainer's Codex",
                    text: teamName ? `Check out my team "${teamName}" on Trainer's Codex` : 'Check out my Trainer\'s Codex team',
                    url: shareUrl,
                  })}
                  className="w-full font-mono text-xs"
                >
                  <Share2 size={12} className="mr-1.5" /> share link…
                </Button>
              )}
              <div className="text-[10px] font-mono text-muted-foreground">
                opens this team when visited · shiny status preserved in URL
              </div>
            </TabsContent>

            <TabsContent value="text" className="space-y-2">
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">// formatted text</div>
              <Textarea readOnly value={teamText}
                        rows={Math.min(filled.length + 6, 12)}
                        className="font-mono text-xs resize-none" />
              <Button onClick={() => copyText(teamText, 'text')} className="w-full font-mono text-xs">
                {copied === 'text' ? <Check size={12} className="mr-1.5 text-green-500" /> : <Copy size={12} className="mr-1.5" />}
                {copied === 'text' ? 'copied to clipboard' : 'copy formatted text'}
              </Button>
            </TabsContent>

            <TabsContent value="showdown" className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">// showdown teambuilder export</div>
                <a href="https://play.pokemonshowdown.com/teambuilder" target="_blank" rel="noopener noreferrer"
                   className="text-[10px] font-mono hover:text-primary flex items-center gap-1 text-muted-foreground">
                  paste into showdown <ExternalLink size={9} />
                </a>
              </div>
              <Textarea readOnly value={showdownText} rows={10} className="font-mono text-[10px] resize-none" />
              <Button onClick={() => copyText(showdownText, 'showdown')} className="w-full font-mono text-xs">
                {copied === 'showdown' ? <Check size={12} className="mr-1.5 text-green-500" /> : <Copy size={12} className="mr-1.5" />}
                {copied === 'showdown' ? 'copied' : 'copy showdown format'}
              </Button>
              <p className="text-[10px] font-mono text-muted-foreground">
                includes your chosen abilities, moves, nicknames, and shiny flags
              </p>
            </TabsContent>
          </Tabs>

          {/* Poster CTA */}
          <div className="mt-3 border rounded-md p-3"
               style={{ borderColor: 'hsl(var(--primary)/0.4)', background: 'hsl(var(--primary)/0.05)' }}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="font-mono text-xs font-semibold text-primary">visual poster?</div>
                <div className="font-mono text-[10px] text-muted-foreground">12 art styles · IG-ready 1080×1350</div>
              </div>
              <Button onClick={onOpenPosterStudio} size="sm" className="font-mono text-xs">
                <Wand2 size={12} className="mr-1.5" /> open studio
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
