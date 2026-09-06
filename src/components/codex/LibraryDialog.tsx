import { useState } from 'react';
import { Save, Download, FolderOpen, Edit3, Trash2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import type { Pokemon, SavedTeam, TeamMember } from '@/lib/types';
import { TYPE_COLORS } from '@/lib/constants';
import { pixelSprite } from '@/lib/pokemon';
import { genId } from '@/lib/storage';

interface LibraryDialogProps {
  open: boolean;
  onClose: () => void;
  savedTeams: SavedTeam[];
  details: Record<number, Pokemon>;
  currentTeam: (Pokemon | null)[];
  currentName: string;
  onLoad: (entry: SavedTeam) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, newName: string) => void;
  onSaveCurrent: (name: string) => void;
  onImport: (parsed: SavedTeam[]) => void;
}

export function LibraryDialog({
  open, onClose, savedTeams, details, currentTeam, currentName,
  onLoad, onDelete, onRename, onSaveCurrent, onImport
}: LibraryDialogProps) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [newName, setNewName] = useState(currentName || '');
  const [importVal, setImportVal] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const exportAll = () => {
    const blob = new Blob([JSON.stringify({ teams: savedTeams, exportedAt: Date.now() }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `trainers-codex-library-${Date.now()}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    setImportError(null);
    try {
      const parsed = JSON.parse(importVal);
      const teams = parsed.teams || parsed;
      if (!Array.isArray(teams)) throw new Error('not an array');
      const cleaned: SavedTeam[] = (teams as unknown[])
        .filter((t): t is { name?: string; ids?: unknown[]; members?: unknown[]; createdAt?: number } => {
          if (typeof t !== 'object' || t === null) return false;
          return 'ids' in t || 'members' in t;
        })
        .map(t => {
          let members: (TeamMember | null)[];
          if (Array.isArray(t.members)) {
            members = (t.members as (TeamMember | null)[]).slice(0, 6);
          } else if (Array.isArray(t.ids)) {
            members = (t.ids as (number | null)[]).slice(0, 6).map(id =>
              id ? { id, shiny: false } : null
            );
          } else {
            members = [];
          }
          while (members.length < 6) members.push(null);
          return {
            id: genId(),
            name: t.name || 'Imported',
            members,
            createdAt: t.createdAt || Date.now(),
          };
        });
      if (cleaned.length === 0) throw new Error('no valid teams in JSON');
      onImport(cleaned);
      setImportVal(''); setImportOpen(false);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'invalid JSON');
    }
  };

  const teamFilledCount = currentTeam.filter(Boolean).length;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg p-0 gap-0 max-h-[90vh] overflow-y-auto scroll-y bg-card">
        <DialogHeader className="px-4 py-3 border-b sticky top-0 bg-card z-10">
          <DialogTitle className="font-display text-lg text-primary lowercase">library</DialogTitle>
          <DialogDescription className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            // {savedTeams.length} saved · stored locally
          </DialogDescription>
        </DialogHeader>

        <div className="p-4 space-y-3">
          {teamFilledCount > 0 && !saveDialogOpen && (
            <Button onClick={() => setSaveDialogOpen(true)} className="w-full font-mono text-xs">
              <Save size={12} className="mr-1.5" /> save current team ({teamFilledCount}/6)
            </Button>
          )}
          {saveDialogOpen && (
            <div className="border rounded-md p-3 fade-up" style={{ borderColor: 'hsl(var(--primary)/0.4)', background: 'hsl(var(--primary)/0.05)' }}>
              <div className="text-[10px] font-mono uppercase tracking-widest mb-2 text-primary">// name this team</div>
              <Input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { onSaveCurrent(newName || 'Untitled'); setSaveDialogOpen(false); setNewName(''); } }}
                placeholder="e.g. anti-meta cup, sunday casual..."
                className="font-mono text-sm mb-2"
              />
              <div className="flex gap-2">
                <Button onClick={() => { onSaveCurrent(newName || 'Untitled'); setSaveDialogOpen(false); setNewName(''); }}
                        className="flex-1 font-mono text-xs">save</Button>
                <Button variant="outline" onClick={() => { setSaveDialogOpen(false); setNewName(''); }}
                        className="font-mono text-xs">cancel</Button>
              </div>
            </div>
          )}

          {savedTeams.length === 0 && (
            <div className="text-center py-10 font-mono text-xs text-muted-foreground">
              // no saved teams yet · build one and save to revisit later
            </div>
          )}
          {savedTeams.map(t => (
            <div key={t.id} className="border rounded-md p-2.5 group transition hover:border-primary bg-card">
              {renaming === t.id ? (
                <div className="flex gap-2 items-center mb-2">
                  <Input
                    autoFocus value={renameVal}
                    onChange={(e) => setRenameVal(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { onRename(t.id, renameVal); setRenaming(null); }
                      if (e.key === 'Escape') setRenaming(null);
                    }}
                    className="flex-1 font-mono text-xs h-8"
                  />
                  <Button size="sm" onClick={() => { onRename(t.id, renameVal); setRenaming(null); }} className="h-8 font-mono text-[10px]">save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setRenaming(null)} className="h-8 font-mono text-[10px]">cancel</Button>
                </div>
              ) : (
                <div className="flex items-center justify-between mb-1.5">
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-sm truncate">{t.name}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">
                      saved {new Date(t.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
                    <Button size="icon" variant="ghost"
                            onClick={() => { setRenaming(t.id); setRenameVal(t.name); }}
                            title="Rename" className="w-7 h-7 text-muted-foreground hover:text-foreground">
                      <Edit3 size={11} />
                    </Button>
                    <Button size="icon" variant="ghost"
                            onClick={() => setConfirmDel(confirmDel === t.id ? null : t.id)}
                            title="Delete"
                            className="w-7 h-7 text-muted-foreground hover:text-destructive"
                            style={{ color: confirmDel === t.id ? 'hsl(var(--destructive))' : undefined }}>
                      <Trash2 size={11} />
                    </Button>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-1 mb-2">
                {t.members.slice(0, 6).map((m, i) => {
                  const p = m ? details[m.id] : null;
                  const shiny = m?.shiny;
                  return (
                    <div key={i} className="w-8 h-8 rounded flex items-center justify-center relative"
                         style={{
                           background: p ? `radial-gradient(circle, ${TYPE_COLORS[p.types[0]]}33, transparent)` : 'transparent',
                           border: p ? (shiny ? '1px solid #fde047aa' : 'none') : '1px dashed hsl(var(--border))',
                         }}>
                      {p ? <img src={pixelSprite(p.id, shiny)} alt="" className="pixel-img w-full h-full object-contain" loading="lazy"
                                onError={(e) => { if (shiny) (e.currentTarget as HTMLImageElement).src = pixelSprite(p.id); }} /> : null}
                      {shiny && <span className="absolute -top-1 -right-0.5 text-[10px]" title="shiny">⭐</span>}
                    </div>
                  );
                })}
              </div>
              {confirmDel === t.id ? (
                <div className="flex gap-2">
                  <Button variant="destructive" size="sm"
                          onClick={() => { onDelete(t.id); setConfirmDel(null); }}
                          className="flex-1 h-7 font-mono text-[10px] uppercase tracking-wider">
                    confirm delete
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setConfirmDel(null)}
                          className="h-7 font-mono text-[10px]">
                    cancel
                  </Button>
                </div>
              ) : (
                <Button variant="outline" onClick={() => onLoad(t)}
                        className="w-full h-7 font-mono text-[10px] uppercase tracking-wider hover:border-primary">
                  load team
                </Button>
              )}
            </div>
          ))}

          <Separator />

          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest mb-2 text-muted-foreground">// backup</div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={exportAll} disabled={savedTeams.length === 0} className="font-mono text-xs">
                <Download size={11} className="mr-1.5" /> export json
              </Button>
              <Button variant="outline" onClick={() => setImportOpen(o => !o)} className="font-mono text-xs">
                <FolderOpen size={11} className="mr-1.5" /> import json
              </Button>
            </div>
            {importOpen && (
              <div className="mt-2 fade-up">
                <Textarea
                  value={importVal}
                  onChange={(e) => setImportVal(e.target.value)}
                  placeholder='Paste exported JSON here...'
                  rows={4}
                  className="font-mono text-[10px]"
                />
                {importError && <div className="text-[10px] font-mono text-destructive mt-1">// {importError}</div>}
                <Button onClick={handleImport} className="mt-2 w-full font-mono text-xs">
                  import
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
