// The region atlas — a route map the career walks.
//
// ── Why this is generated, not drawn ─────────────────────────────────────
// Two reasons, and the second is the binding one:
//
//   1. A map that is the SAME every run is scenery. A map derived from the
//      seed is part of the run — it is the shape of *this* career, and it is
//      the thing a `?seed=` link reproduces along with everything else.
//   2. IP. Every canon region map is copyrighted, and so is every canon town
//      name. Nothing here is traced, sampled, or transliterated from one: the
//      layout is a seeded walk and the names are built from generic English
//      geography words. See docs/JOURNEY_MODE.md § IP posture.
//
// ── The contract ─────────────────────────────────────────────────────────
// `regionAtlas(seed, regionId)` is pure and memoised. Same inputs → identical
// node ids, names, kinds and coordinates, forever, on any device. Coordinates
// are normalised 0..1 with y increasing DOWNWARD, matching SVG/canvas so no
// consumer has to flip an axis.

import { namedRng, pick, type Rng } from './prng';
import { getRegion } from './content';
import { BADGES_PER_REGION } from './types';

export type AtlasNodeKind = 'start' | 'town' | 'gym' | 'wild' | 'landmark' | 'league';

export interface AtlasNode {
  /** Stable within a region: `${regionId}-${index}`. */
  id: string;
  kind: AtlasNodeKind;
  name: string;
  /** 0..1, y increases downward (SVG/canvas convention). */
  x: number;
  y: number;
  /**
   * For `kind: 'gym'`, which badge this gym awards (1-based).
   * Lets the UI mark a gym cleared straight from the badge list.
   */
  badgeIndex?: number;
}

export interface RegionAtlas {
  regionId: string;
  label: string;
  nodes: AtlasNode[];
}

// ── Naming ───────────────────────────────────────────────────────────────
// Deliberately generic English geography. No canon settlement name appears in
// any pool, and none is reachable by combination — the parts are ordinary
// words, which is exactly the point.

const PREFIX = [
  'Ash', 'Bram', 'Cinder', 'Dun', 'Elder', 'Fen', 'Glass', 'Hollow', 'Iron',
  'Kestrel', 'Larch', 'Marrow', 'North', 'Oak', 'Pale', 'Quarry', 'Rook',
  'Sable', 'Thorn', 'Umber', 'Vale', 'Wick', 'Yarrow', 'Bluff', 'Copper',
];
const SUFFIX = [
  'ford', 'wick', 'mere', 'hollow', 'reach', 'gate', 'cross', 'stead',
  'barrow', 'haven', 'march', 'field', 'crest', 'hearth', 'moor',
];
const TOWN_TAG = ['Town', 'City', 'Village', 'Port', 'Outpost'];
const WILD_TAG = [
  'Wood', 'Flats', 'Ridge', 'Marsh', 'Pass', 'Hollow', 'Thicket', 'Dunes',
  'Gorge', 'Steps', 'Bog', 'Scree',
];
const LANDMARK_TAG = [
  'Lighthouse', 'Observatory', 'Ruins', 'Aqueduct', 'Waystation', 'Old Mill',
  'Standing Stones', 'Cable Car', 'Wind Farm', 'Quarry Works',
];

/**
 * A place name not already used in this region.
 *
 * The pools combine to ~360 names and a region draws ~18, so by the birthday
 * paradox a naive draw collides more often than not — a region with two
 * "Fenmere"s reads as a bug. Retries are bounded and the fallback appends a
 * disambiguator rather than looping forever.
 */
function placeName(rng: Rng, used: Set<string>): string {
  for (let attempt = 0; attempt < 24; attempt++) {
    const name = `${pick(rng, PREFIX)}${pick(rng, SUFFIX)}`;
    if (!used.has(name)) { used.add(name); return name; }
  }
  let n = 2;
  const base = `${pick(rng, PREFIX)}${pick(rng, SUFFIX)}`;
  while (used.has(`${base} ${n}`)) n++;
  const out = `${base} ${n}`;
  used.add(out);
  return out;
}

/**
 * The kind sequence a region walks.
 *
 * Built rather than randomised so every region reads as a journey: leave home,
 * cross wilderness, reach a gym, repeat, finish at the League. The gym count is
 * `BADGES_PER_REGION` exactly, so the map and the badge track can never
 * disagree about how many gyms a region has — that mismatch is precisely the
 * class of bug that made `full-circuit` unreachable.
 */
function kindSequence(): AtlasNodeKind[] {
  const out: AtlasNodeKind[] = ['start'];
  for (let gym = 0; gym < BADGES_PER_REGION; gym++) {
    // One connective node per gym, rotating kind so the path is not a
    // metronome. Deliberately ONE — an earlier version added a town on odd
    // gyms too, which pushed the region to 23 nodes and made the map a wall of
    // labels rather than a route you can read at a glance.
    out.push(gym % 3 === 2 ? 'landmark' : gym % 3 === 1 ? 'town' : 'wild');
    out.push('gym');
  }
  out.push('league');
  return out;
}

/**
 * Lay nodes along a meandering walk from bottom-left to top-right.
 *
 * A straight line would render as a progress bar, which is not a map. The walk
 * advances monotonically along the diagonal (so "further along the path" always
 * reads as "further from home") while jittering perpendicular to it, and each
 * placement is pushed away from its predecessors so labels never collide.
 */
const MARGIN = 0.07;
/** Minimum normalised separation. Below this, two labels collide on screen. */
const MIN_SEP = 0.05;

const clampToBox = (n: number) => Math.max(MARGIN, Math.min(1 - MARGIN, n));

/**
 * Lay nodes evenly along a smooth road.
 *
 * Two earlier attempts are worth recording, because both looked reasonable in
 * code and wrong on screen:
 *
 *   1. Diagonal base position plus per-node random offset. Adjacent nodes swung
 *      opposite ways and the road rendered as a SAWTOOTH — a bar chart, not a
 *      route.
 *   2. Diagonal base plus a coherent sine. Smooth, but nodes BUNCHED: `t` is
 *      uniform along the diagonal, not along the curve, so wherever the road
 *      bent, spacing collapsed — six nodes crowded the top-right corner while
 *      the bottom-left sat empty, and the labels piled up with them.
 *
 * The fix for both is to separate the road's SHAPE from the node SPACING. The
 * spine is sampled densely, its arc length measured, and nodes placed at equal
 * arc-length intervals — so spacing is even no matter how hard the road bends.
 * `x` is monotonic in `t`, so the route can never double back on itself.
 */
function layout(rng: Rng, count: number): Array<{ x: number; y: number }> {
  const span = 1 - MARGIN * 2;
  // One meander for the whole region, drawn once.
  const phase = rng() * Math.PI * 2;
  const freq = 1.1 + rng() * 1.2;
  const amp = 0.16 + rng() * 0.10;

  // ---- 1. sample the spine ----
  const SAMPLES = 400;
  const spine: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    // Damped at both ends so the start and the league sit where the eye
    // expects them rather than mid-swing.
    const damp = Math.sin(Math.PI * t);
    const swing = Math.sin(phase + t * Math.PI * 2 * freq) * amp * damp;
    spine.push({
      x: MARGIN + span * t,
      y: clampToBox(MARGIN + span * (1 - t) + swing),
    });
  }

  // ---- 2. cumulative arc length ----
  const cum: number[] = [0];
  for (let i = 1; i < spine.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(spine[i].x - spine[i - 1].x, spine[i].y - spine[i - 1].y));
  }
  const total = cum[cum.length - 1];

  // ---- 3. place nodes at equal arc length ----
  const pts: Array<{ x: number; y: number }> = [];
  let cursor = 0;
  for (let i = 0; i < count; i++) {
    const target = count === 1 ? 0 : (i / (count - 1)) * total;
    while (cursor < cum.length - 1 && cum[cursor + 1] < target) cursor++;
    const segLen = cum[cursor + 1] - cum[cursor];
    const f = segLen > 1e-9 ? (target - cum[cursor]) / segLen : 0;
    const a = spine[cursor];
    const b = spine[Math.min(cursor + 1, spine.length - 1)];
    pts.push({
      x: clampToBox(a.x + (b.x - a.x) * f),
      y: clampToBox(a.y + (b.y - a.y) * f),
    });
  }

  // ---- 4. safety relaxation ----
  // Equal arc length already spaces these out; this only catches a road that
  // folds back on itself tightly enough to bring two distant nodes together.
  // Clamping happens INSIDE the loop — separating first and clamping after was
  // measured pushing two nodes into the same corner at exactly 0.0000 apart.
  for (let pass = 0; pass < 16; pass++) {
    let moved = false;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[j].x - pts[i].x;
        const dy = pts[j].y - pts[i].y;
        const d = Math.hypot(dx, dy);
        if (d >= MIN_SEP) continue;
        moved = true;
        // Coincident points have no direction to separate along; give them a
        // deterministic one rather than dividing by zero.
        const ux = d > 1e-6 ? dx / d : 1;
        const uy = d > 1e-6 ? dy / d : 0;
        const push = (MIN_SEP - d) / 2 + 0.002;
        pts[i].x = clampToBox(pts[i].x - ux * push);
        pts[i].y = clampToBox(pts[i].y - uy * push);
        pts[j].x = clampToBox(pts[j].x + ux * push);
        pts[j].y = clampToBox(pts[j].y + uy * push);
      }
    }
    if (!moved) break;
  }
  return pts;
}

const cache = new Map<string, RegionAtlas>();

/** The route map for a region. Memoised — pure in (seed, regionId). */
export function regionAtlas(seed: number, regionId: string): RegionAtlas {
  const key = `${seed}:${regionId}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const region = getRegion(regionId);
  const rng = namedRng(seed, `atlas-${regionId}`);
  const kinds = kindSequence();
  const pts = layout(rng, kinds.length);

  let badge = 0;
  const used = new Set<string>();
  const nodes: AtlasNode[] = kinds.map((kind, i) => {
    const base = placeName(rng, used);
    let name: string;
    if (kind === 'start') name = `${base} ${pick(rng, TOWN_TAG)}`;
    else if (kind === 'town') name = `${base} ${pick(rng, TOWN_TAG)}`;
    else if (kind === 'gym') name = `${base} Gym`;
    else if (kind === 'wild') name = `${base} ${pick(rng, WILD_TAG)}`;
    else if (kind === 'landmark') name = `${base} ${pick(rng, LANDMARK_TAG)}`;
    else name = `${region.label} League`;

    return {
      id: `${regionId}-${i}`,
      kind,
      name,
      x: pts[i].x,
      y: pts[i].y,
      badgeIndex: kind === 'gym' ? ++badge : undefined,
    };
  });

  const atlas: RegionAtlas = { regionId, label: region.label, nodes };
  cache.set(key, atlas);
  return atlas;
}

// ── Progress ─────────────────────────────────────────────────────────────

export interface AtlasProgress {
  /** Index of the node the trainer is standing on. */
  currentIndex: number;
  /** Node indices already behind them (exclusive of current). */
  visitedCount: number;
  /** Gym node indices whose badge has been earned. */
  clearedGyms: Set<number>;
}

/**
 * Where the trainer is on a region's map.
 *
 * Position comes from progress THROUGH THE REGION, not from the badge count —
 * a player who loses a gym still moves down the road, and a map that froze on a
 * loss would contradict the recap that just said "rematch next chapter".
 *
 * Gyms clear from the badge list instead, so the map agrees with the badge
 * track by construction rather than by a parallel rule that can drift.
 */
export function atlasProgress(opts: {
  atlas: RegionAtlas;
  /** Chapters completed in this region. */
  localIndex: number;
  /** Total chapters this region spans. */
  localCount: number;
  /** Badges earned in this region. */
  regionBadges: number;
}): AtlasProgress {
  const { atlas, localIndex, localCount, regionBadges } = opts;
  const last = atlas.nodes.length - 1;
  const t = localCount > 1 ? Math.max(0, Math.min(1, localIndex / (localCount - 1))) : 1;
  const currentIndex = Math.max(0, Math.min(last, Math.round(t * last)));

  const clearedGyms = new Set<number>();
  atlas.nodes.forEach((n, i) => {
    if (n.kind === 'gym' && n.badgeIndex !== undefined && n.badgeIndex <= regionBadges) {
      clearedGyms.add(i);
    }
  });

  return { currentIndex, visitedCount: currentIndex, clearedGyms };
}

export interface LabelPlacement {
  x: number;
  y: number;
  anchor: 'start' | 'middle' | 'end';
}

/**
 * Where a node's label sits, and how it anchors.
 *
 * Anchoring is derived from position because a centred label on a node near the
 * edge runs straight off the viewBox and is clipped — which is exactly what
 * shipped in the first render: "Kanto League" lost its right half. Nodes in the
 * outer fifth anchor inward instead, and the y is pushed below the node when it
 * sits too near the top to hang a label above it.
 *
 * `pad` is the widest a label may extend past its anchor point; callers pass the
 * value their font actually produces.
 */
export function labelPlacement(
  node: AtlasNode, w: number, h: number, pad = 30,
): LabelPlacement {
  const x = node.x * w;
  const y = node.y * h;
  const anchor: LabelPlacement['anchor'] =
    x < pad ? 'start' : x > w - pad ? 'end' : 'middle';
  // Labels hang above the node, except the league's: it sits at the end of the
  // road with the last gym's number directly above it, and the two overlapped.
  const below = node.kind === 'league';
  const above = y - 9;
  return {
    x: Math.max(2, Math.min(w - 2, x)),
    y: below ? y + 15 : above < 9 ? y + 15 : above,
    anchor,
  };
}

/**
 * The polyline through every node, as an SVG `points`-style list scaled to a
 * viewBox. Kept here so the renderer holds no geometry of its own and the
 * layout can be tested without a DOM.
 */
export function atlasPolyline(atlas: RegionAtlas, w: number, h: number): Array<[number, number]> {
  return atlas.nodes.map(n => [n.x * w, n.y * h] as [number, number]);
}
