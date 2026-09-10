import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Map as MapIcon } from 'lucide-react';
import { useI18n } from '@/i18n/useI18n';
import { atlasProgress, labelPlacement, regionAtlas, type AtlasNode } from '@/journey/atlas';
import { cn } from '@/lib/utils';
import type { RegionProgress } from '@/journey/types';

/**
 * The region map, filling in as the career walks it.
 *
 * SVG rather than canvas: it is a dozen shapes and some text, it stays crisp at
 * any size without a devicePixelRatio dance, and it inherits theme colours from
 * CSS instead of needing them passed in. The canvas renderers in this project
 * exist for things that must become a PNG — this does not.
 *
 * All geometry comes from `journey/atlas.ts` so it is testable without a DOM;
 * this file holds presentation only.
 */

const VB_W = 320;
const VB_H = 190;

/** Marker for one node. Gyms read as badges, the league as a crown-ish gate. */
function NodeMark({ node, x, y, state }: {
  node: AtlasNode;
  x: number;
  y: number;
  state: 'past' | 'current' | 'future';
}) {
  const cleared = state !== 'future';
  const stroke = state === 'current' ? 'hsl(var(--primary))'
    : cleared ? 'hsl(var(--primary))'
    : 'hsl(var(--muted-foreground))';
  const fill = state === 'current' ? 'hsl(var(--primary))'
    : cleared ? 'hsl(var(--primary))'
    : 'transparent';
  const opacity = state === 'future' ? 0.45 : 1;

  if (node.kind === 'gym') {
    // Diamond — the one shape that reads differently from every route node, so
    // a player can count gyms without reading a single label.
    const r = state === 'current' ? 6 : 5;
    return (
      <g opacity={opacity}>
        <polygon
          points={`${x},${y - r} ${x + r},${y} ${x},${y + r} ${x - r},${y}`}
          fill={fill} stroke={stroke} strokeWidth={1.4}
        />
      </g>
    );
  }

  if (node.kind === 'league') {
    const r = 7;
    return (
      <g opacity={opacity}>
        <rect x={x - r} y={y - r} width={r * 2} height={r * 2} rx={2}
              fill={fill} stroke={stroke} strokeWidth={1.6} />
      </g>
    );
  }

  const r = node.kind === 'start' || node.kind === 'town' ? 4.5 : 3;
  return (
    <circle cx={x} cy={y} r={state === 'current' ? r + 1.5 : r}
            fill={fill} stroke={stroke} strokeWidth={1.3} opacity={opacity} />
  );
}

export function AreaMap({ seed, region, defaultOpen = false }: {
  seed: number;
  region: RegionProgress;
  /** Open on the result screen (it is the payoff), collapsed mid-run. */
  defaultOpen?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(defaultOpen);

  const atlas = useMemo(() => regionAtlas(seed, region.regionId), [seed, region.regionId]);
  const progress = useMemo(() => atlasProgress({
    atlas,
    localIndex: region.localIndex ?? 0,
    localCount: region.localCount ?? 1,
    regionBadges: region.regionBadges,
  }), [atlas, region.localIndex, region.localCount, region.regionBadges]);

  const pts = useMemo(
    () => atlas.nodes.map(n => [n.x * VB_W, n.y * VB_H] as const),
    [atlas],
  );

  const walked = pts.slice(0, progress.currentIndex + 1);
  const ahead = pts.slice(progress.currentIndex);
  const here = atlas.nodes[progress.currentIndex];

  /**
   * Smooth the road through its nodes.
   *
   * Straight segments between points rendered as a chart, not a route. This is
   * a Catmull-Rom spline converted to cubic Béziers, which passes exactly
   * through every node (so a marker still sits on its road) while curving
   * between them.
   */
  const toPath = (list: readonly (readonly [number, number])[]) => {
    if (list.length === 0) return '';
    if (list.length < 3) {
      return list.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    }
    const at = (i: number) => list[Math.max(0, Math.min(list.length - 1, i))];
    let d = `M${at(0)[0].toFixed(1)},${at(0)[1].toFixed(1)}`;
    for (let i = 0; i < list.length - 1; i++) {
      const [x0, y0] = at(i - 1);
      const [x1, y1] = at(i);
      const [x2, y2] = at(i + 1);
      const [x3, y3] = at(i + 2);
      // 1/6 is the standard Catmull-Rom → Bézier tangent scale.
      const c1x = x1 + (x2 - x0) / 6, c1y = y1 + (y2 - y0) / 6;
      const c2x = x2 - (x3 - x1) / 6, c2y = y2 - (y3 - y1) / 6;
      d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
    }
    return d;
  };

  return (
    <div className="rounded-md border" style={{ borderColor: 'hsl(var(--border))' }}
         data-testid="journey-map">
      <button
        onClick={() => setOpen(o => !o)}
        data-testid="journey-map-toggle"
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-primary/5 rounded-md"
      >
        <span className="font-mono text-[11px] font-semibold text-primary flex items-center gap-1.5">
          <MapIcon size={12} />
          {t('journey.map.title', { region: atlas.label })}
        </span>
        <span className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-muted-foreground truncate max-w-[9rem]"
                data-testid="journey-map-here">
            {here?.name ?? ''}
          </span>
          {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3">
          <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="w-full h-auto"
               role="img"
               aria-label={t('journey.map.alt', {
                 region: atlas.label,
                 here: here?.name ?? '',
                 badges: region.regionBadges,
               })}
               data-testid="journey-map-svg">
            {/* Road ahead first, so the walked road paints over its join. */}
            <path d={toPath(ahead)} fill="none"
                  stroke="hsl(var(--muted-foreground))" strokeWidth={1.2}
                  strokeDasharray="3 4" opacity={0.5} />
            <path d={toPath(walked)} fill="none"
                  stroke="hsl(var(--primary))" strokeWidth={2} strokeLinecap="round" />

            {atlas.nodes.map((n, i) => {
              const [x, y] = pts[i];
              const state = i === progress.currentIndex ? 'current'
                : i < progress.currentIndex ? 'past' : 'future';
              // A gym is only "lit" once its badge is actually earned — the map
              // reads the badge list rather than keeping its own rule.
              const gymDark = n.kind === 'gym' && !progress.clearedGyms.has(i);
              return (
                <g key={n.id} data-testid={`journey-map-node-${i}`}
                   data-state={state}
                   data-cleared={n.kind === 'gym' ? (gymDark ? 'false' : 'true') : undefined}>
                  <NodeMark node={n} x={x} y={y}
                            state={gymDark && state !== 'current' ? 'future' : state} />
                  {/* Gym numbers only.
                      The current node's name is already in the header, and
                      drawing it here duplicated it AND collided with the nearest
                      gym. The league's name collided too — it is the last node
                      on the road with the eighth gym right beside it, and a
                      nine-character label cannot fit between them at any anchor.
                      The legend row below the map explains ◆ and ■, so the
                      shapes carry it without a label. What is left is short,
                      evenly spaced, and cannot collide. */}
                  {n.kind === 'gym' && (() => {
                    const lp = labelPlacement(n, VB_W, VB_H);
                    return (
                      <text
                        x={lp.x} y={lp.y} textAnchor={lp.anchor}
                        className={cn(
                          'font-mono',
                          state === 'future' ? 'fill-muted-foreground' : 'fill-foreground',
                        )}
                        style={{ fontSize: 7, opacity: state === 'future' ? 0.6 : 1 }}
                      >
                        {n.kind === 'gym' ? `${n.badgeIndex}` : n.name}
                      </text>
                    );
                  })()}
                </g>
              );
            })}
          </svg>

          <div className="flex items-center justify-between gap-2 mt-1">
            <span className="font-mono text-[10px] text-muted-foreground">
              {t('journey.map.legend')}
            </span>
            <span className="font-mono text-[10px] text-primary" data-testid="journey-map-badges">
              {t('journey.map.badges', { n: region.regionBadges, total: 8 })}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
