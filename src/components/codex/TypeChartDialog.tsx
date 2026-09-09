import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '@/components/ui/dialog';
import { TYPES, TYPE_CHART, TYPE_COLORS } from '@/lib/constants';

interface TypeChartDialogProps {
  open: boolean;
  onClose: () => void;
}

export function TypeChartDialog({ open, onClose }: TypeChartDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl min-w-0 p-0 gap-0 max-h-[90dvh] overflow-y-auto scroll-y bg-card">
        <DialogHeader className="px-4 py-3 border-b sticky top-0 bg-card z-10">
          <DialogTitle className="font-display text-lg text-primary lowercase">type chart</DialogTitle>
          <DialogDescription className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            // attacker → defender · 18×18 matrix
          </DialogDescription>
        </DialogHeader>

        <div className="p-4 min-w-0">
          {/* min-w-0: the 18-column table must scroll inside this box, not
              size it — at 390px it used to push the dialog to 608px wide. */}
          <div className="overflow-x-auto scroll-x min-w-0">
            <table className="font-mono text-[10px] border-separate" style={{ borderSpacing: '1px' }}>
              <thead>
                <tr>
                  <th className="text-muted-foreground p-0.5 text-left">ATK ↓ / DEF →</th>
                  {TYPES.map(t => (
                    <th key={t} className="p-0.5" style={{ color: TYPE_COLORS[t], minWidth: '28px' }}>
                      {t.slice(0, 3).toUpperCase()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TYPES.map(atk => (
                  <tr key={atk}>
                    <th className="text-left p-0.5" style={{ color: TYPE_COLORS[atk] }}>{atk}</th>
                    {TYPES.map(def => {
                      const v = TYPE_CHART[atk]?.[def] ?? 1;
                      let color = 'transparent';
                      let label = '';
                      if (v === 0)         { color = '#1e3a8a'; label = '0'; }
                      else if (v === 0.5)  { color = '#15803d44'; label = '½'; }
                      else if (v === 2)    { color = '#a16207'; label = '2'; }
                      return (
                        <td key={def} className="text-center p-1 rounded"
                            style={{ background: color, color: v === 1 ? 'hsl(var(--muted-foreground))' : '#fff', opacity: v === 1 ? 0.2 : 1 }}>
                          {label || '·'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-[10px] font-mono">
            <Legend color="#a16207" label="super-effective 2×" />
            <Legend color="#15803d44" label="resists ½×" />
            <Legend color="#1e3a8a" label="immune 0×" />
            <Legend color="transparent" label="neutral 1×" />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="w-3 h-3 rounded-sm" style={{ background: color, border: color === 'transparent' ? '1px solid hsl(var(--border))' : 'none' }} />
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}
