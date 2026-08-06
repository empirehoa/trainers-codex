import { useState, useMemo } from 'react';
import { ClipboardPaste, Copy, Download, Check } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import type { TeamMember } from '@/lib/types';
import { parsePokePaste, exportPokePaste } from '@/lib/showdown';
import { isPasteUrl, fetchPasteText } from '@/lib/paste-url';

interface ShowdownImportDialogProps {
  open: boolean;
  onClose: () => void;
  members: (TeamMember | null)[];
  onImport: (members: TeamMember[]) => void;
}

const SAMPLE = `Landorus-Therian @ Choice Scarf
Ability: Intimidate
Tera Type: Flying
EVs: 252 Atk / 4 Def / 252 Spe
Jolly Nature
- Earthquake
- U-turn
- Stone Edge
- Stealth Rock`;

export function ShowdownImportDialog({ open, onClose, members, onImport }: ShowdownImportDialogProps) {
  const [paste, setPaste] = useState('');
  const [copied, setCopied] = useState(false);
  const [fetching, setFetching] = useState(false);

  const exported = useMemo(() => exportPokePaste(members), [members]);
  const hasTeam = members.some(Boolean);

  const importText = (text: string) => {
    const parsed = parsePokePaste(text);
    if (!parsed.length) {
      toast.error('no valid Pokémon found — check the paste format');
      return;
    }
    onImport(parsed);
    toast.success(`imported ${parsed.length} Pokémon from Showdown`);
    setPaste('');
    onClose();
  };

  const doImport = async () => {
    // Users share LINKS, not text walls — accept a pokepast.es / PokeBin /
    // Showdown-teams URL directly. Those hosts don't guarantee CORS, so a
    // failed fetch degrades to a clear instruction rather than a dead end.
    if (isPasteUrl(paste)) {
      setFetching(true);
      try {
        const text = await fetchPasteText(paste);
        if (text) {
          setPaste(text);
          importText(text);
        } else {
          toast.error('couldn\'t fetch that link (the paste site blocks cross-site reads) — open it, copy the team text, and paste it here');
        }
      } finally {
        setFetching(false);
      }
      return;
    }
    importText(paste);
  };

  const doCopy = async () => {
    try {
      await navigator.clipboard.writeText(exported);
      setCopied(true);
      toast.success('copied to clipboard');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('clipboard blocked — select the text and copy manually');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg p-0 gap-0 max-h-[90vh] overflow-y-auto scroll-y bg-card">
        <DialogHeader className="px-4 py-3 border-b sticky top-0 bg-card z-10">
          <DialogTitle className="font-display text-lg text-primary lowercase">showdown / pokepaste</DialogTitle>
          <DialogDescription className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            // import or export competitive teams
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="import" className="px-4 py-3">
          <TabsList className="grid grid-cols-2 w-full font-mono text-xs">
            <TabsTrigger value="import" data-testid="sd-tab-import">Import</TabsTrigger>
            <TabsTrigger value="export" data-testid="sd-tab-export">Export</TabsTrigger>
          </TabsList>

          <TabsContent value="import" className="mt-3 space-y-2">
            <p className="font-mono text-[10px] text-muted-foreground leading-relaxed">
              // paste a team from Pokémon Showdown, PokePaste, Pikalytics, or any
              tool that exports the standard text format — or drop a
              pokepast.es / PokeBin / Showdown-teams LINK and we'll fetch it.
              Forms, held items, abilities, Tera type, EVs/IVs, nature, and all
              4 moves are imported.
            </p>
            <Textarea
              data-testid="sd-import-text"
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder={SAMPLE}
              spellCheck={false}
              className="font-mono text-xs h-64 resize-none"
            />
            <div className="flex items-center justify-between gap-2">
              <Button variant="ghost" size="sm" onClick={() => setPaste(SAMPLE)}
                      className="font-mono text-[10px] text-muted-foreground">
                load sample
              </Button>
              <Button data-testid="sd-import-btn" onClick={doImport} disabled={!paste.trim() || fetching}
                      className="font-mono text-xs font-bold">
                <ClipboardPaste size={13} className="mr-1.5" />
                {fetching ? 'Fetching…' : isPasteUrl(paste) ? 'Fetch & import' : 'Import team'}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="export" className="mt-3 space-y-2">
            <p className="font-mono text-[10px] text-muted-foreground leading-relaxed">
              // your current team in Showdown format — paste straight into the
              Showdown teambuilder or PokePaste.
            </p>
            <Textarea
              data-testid="sd-export-text"
              value={hasTeam ? exported : ''}
              readOnly
              placeholder="// add Pokémon to your team to export"
              spellCheck={false}
              className="font-mono text-xs h-64 resize-none"
            />
            <div className="flex items-center justify-end gap-2">
              <Button data-testid="sd-copy-btn" onClick={doCopy} disabled={!hasTeam}
                      variant="outline" className="font-mono text-xs">
                {copied ? <Check size={13} className="mr-1.5" /> : <Copy size={13} className="mr-1.5" />}
                {copied ? 'Copied' : 'Copy PokePaste'}
              </Button>
              <Button
                onClick={() => {
                  const blob = new Blob([exported], { type: 'text/plain' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url; a.download = 'team.txt'; a.click();
                  URL.revokeObjectURL(url);
                }}
                disabled={!hasTeam}
                className="font-mono text-xs font-bold"
              >
                <Download size={13} className="mr-1.5" />
                Download .txt
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
