import { ENTITY_CATEGORIES, getWeight, isGrowthAssetDetails, type EntityCategory, type FinancialEntity } from './entity';
import { getHorizonBucket } from './layout';
import { buildHealthContext, computeHealth, getDisplayHealthOverride, HEALTH_COLORS, type HealthStatus } from './health';
import { computeMagnitudeShare, computeTreeMagnitudeShare } from './sizing';

export interface CityPosition {
  x: number;
  z: number;
}

export interface CityCellBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface CityBuilding {
  id: string;
  name: string;
  category: EntityCategory;
  x: number;
  z: number;
  height: number;
  footprint: number;
  color: string;
  /** The same status `color` was resolved from — kept as the enum (not just its hex) so callers
   * can single out e.g. 'risk' buildings for a visual treatment without string-matching a color. */
  healthStatus: HealthStatus;
  /** True only when 'risk' came from an actual computed judgment (high debt burden, thin
   * insurance coverage, a stalled goal) — NOT from a flat category color. Every expense's
   * `healthStatus` is unconditionally 'risk' too (getDisplayHealthOverride — that's just "this
   * category is always drawn red", not a warning), so a UI that wants to flag "this genuinely
   * needs attention" must check this, not `healthStatus === 'risk'` directly. */
  isAtRisk: boolean;
  /** Raw amount (not the visually rank-scaled height/footprint) — for anything that needs to
   * compare true magnitudes across buildings, like the lake's liquid-vs-pension radius ratio. */
  weight: number;
  /** The drag-allowed area for this building's own category column + depth row — a manually
   * dragged position is always clamped to this, never free across the whole city. */
  cellBounds: CityCellBounds;
}

// Widened from the original 6.5/10.5 — the tighter spacing left barely any room to drag
// buildings apart within a crowded category/depth cell (see cellBounds below), which was the
// actual complaint: not that buildings looked wrong, but that there wasn't screen space to
// spread them out by hand. Every downstream size (ground, camera framing, labels) is derived
// from these two constants, so widening them scales the whole city instead of needing a change
// per call site.
export const DISTRICT_SPACING = 9;
export const DEPTH_SPACING = 14;
const MIN_HEIGHT = 0.6;
export const MAX_HEIGHT = 9;
// the four growth-asset kinds (savings/investment/pension/studyFund, rendered as trees) are the
// city's own core "money flow" story, but everything else added around them this session — the
// water streams, the checking bridge, the independence dome — has grown steadily louder, and the
// trees themselves stayed at the same scale as any other building. Boosting just their own height
// makes them read as the visual anchor they're meant to be instead of getting lost among all the
// newer, taller decoration surrounding them.
const GROWTH_TREE_HEIGHT_BOOST = 1.7;
// a tree's own floor — a barely-funded savings/pension entity still deserves to read as an
// actual small tree, not a near-invisible sprout.
const GROWTH_TREE_MIN_HEIGHT = 1.5;
const CURVE_MAX_TREE_HEIGHT = MAX_HEIGHT * GROWTH_TREE_HEIGHT_BOOST;
// a real ₪700K-vs-₪1M jump (only ~1.4x) is exactly the kind of difference a log curve inherently
// compresses — both amounts already sit near the top of the curve, where a given ratio moves
// share only a little regardless of how narrow the window is. Rather than narrow the window
// further (which would just squeeze the *low* end instead), amounts past a real ₪ threshold get a
// second, LINEAR bonus on top of the curve — linear because at this point it's the literal ₪
// difference the household actually has, not another log-compressed ratio, that should read as a
// visibly bigger tree.
const TREE_BIG_MONEY_THRESHOLD = 500_000;
const TREE_BIG_MONEY_SCALE = 300_000; // every ₪300K past the threshold adds one more height unit
const TREE_BIG_MONEY_MAX_BONUS = 4;
// the real ceiling a tree's own height can reach, curve + bonus combined —
// cityGrowthGeometry.ts's trunk/canopy caps need this exact number, not just the curve's own
// ceiling, or they clip every well-funded tree well past the point where two very different real
// amounts start rendering as the literal same tree (which is exactly what happened the first time
// a height boost was added here without updating those caps to match).
export const MAX_TREE_HEIGHT = CURVE_MAX_TREE_HEIGHT + TREE_BIG_MONEY_MAX_BONUS;
const MIN_FOOTPRINT = 0.75;
export const MAX_FOOTPRINT = 1.7;
// bigger than MAX_FOOTPRINT on purpose — equal values meant the biggest buildings in a district
// touched edge-to-edge with zero gap between them.
export const LOT_SIZE = 2.6;
// How far a manual drag is allowed to push a building past its auto-arranged cell before it'd
// visually collide with the neighboring category column or depth tier — kept proportional to the
// wider DISTRICT_SPACING/DEPTH_SPACING above rather than a fixed margin, so the extra room those
// actually becomes usable drag space instead of just a bigger empty buffer.
const DRAG_MARGIN_X = 1.3;
const DRAG_MARGIN_Z_BACK = 2;

// Locked/long-term money is meant to read as categorically more remote, not just one more row
// spaced like all the others — pushed back further behind where the uniform grid would otherwise
// put it. More than a flat extra DEPTH_SPACING (1x) — that only matched the spacing between every
// other pair of tiers, leaving short-term's own back edge (see SHORT_TERM_LOT_SIZE above) right
// up against long-term's front line with no real gap of its own to grow into.
const LONG_TERM_EXTRA_GAP = DEPTH_SPACING * 1.6;

/** The z-coordinate for a given depth tier — every tier is evenly spaced except tier 0
 * (locked/long-term), which gets pushed an extra DEPTH_SPACING further back. Exported so CityView
 * can derive matching ground/camera/label framing from the same single source of truth. */
export function depthBaseZ(depth: number): number {
  if (depth === 0) return -LONG_TERM_EXTRA_GAP;
  return depth * DEPTH_SPACING;
}
// the short-term tier (depth 1) is where the taller boosted trees most often land — widens the
// row/column grid spacing *between entities within that one tier* (not the gap between tiers,
// which a first pass tried and which pushed the tiers after it further away instead of actually
// giving this tier's own entities more room between each other).
const SHORT_TERM_LOT_SIZE = LOT_SIZE * 1.6;

// How many depth tiers back (from its own auto-assigned one) a category's buildings can be
// dragged. Two tiers back is the default for everyone — one tier back only reached the adjacent
// tier's own front line, which stopped a short-term entity partway instead of letting it actually
// reach toward long-term the way dragging visibly invited. Expenses need this override for a
// different reason (getHorizonBucket has no per-entity variation for expenses, unlike
// debt/goal/investment etc., so without *some* reach every expense would be stuck in one lane with
// no way to manually set any of them apart as more "short-term") but the number they need is the
// same as the new default, so no override is left to state here.
const DEPTH_REACH: Partial<Record<EntityCategory, number>> = {};
const DEFAULT_DEPTH_REACH = 2;
// long-term is the very back tier — there's no *next* tier past it whose front line a bigger
// reach could ever encroach on, so it gets extra room to recede even further, for anyone who
// wants their long-term trees to visibly read as further away than everything else.
const LONG_TERM_DEPTH_REACH = 5;
// short-term itself also needed more than the shared default — pushing long-term's own front
// line further back (see LONG_TERM_EXTRA_GAP) only moved where long-term sits, it never touched
// how far a short-term entity could actually be dragged toward it, which stayed capped at the
// old default reach. This gives short-term real room to spread its own entities apart across, not
// just a bigger gap it still can't reach into. A flat reach this big is bigger than the actual gap
// to long-term's own (now-further-back) front line, though — computeCellBounds clamps the result
// against that line below so a short-term entity can get right up to it but never past it.
const SHORT_TERM_DEPTH_REACH = 4;
// the real minimum z the ground/camera framing needs to cover — not just depthBaseZ(0), but how
// far a long-term entity can actually be dragged behind it (see LONG_TERM_DEPTH_REACH above).
// Without this, dragging a tree out to that new extra room would visibly walk it off the edge of
// the rendered ground plane, the same "fell off the terrain" bug hit earlier with a fixed-position
// placement elsewhere in this city. Exported so CityView can size the ground to actually match.
export const LONG_TERM_MIN_Z = depthBaseZ(0) - (DEPTH_SPACING * LONG_TERM_DEPTH_REACH - DRAG_MARGIN_Z_BACK);

// short-term's own reach (see SHORT_TERM_DEPTH_REACH) is bigger than the real gap to long-term's
// own front line — without a hard floor for it specifically, a dragged (or even auto-placed,
// row-spread) short-term entity could land at or past that line, reading as if it belonged to the
// long-term tier instead. Long-term's own tier is deliberately exempt from this floor — it's the
// one tier that's actually meant to recede past its own front line (see LONG_TERM_DEPTH_REACH).
const SHORT_TERM_MIN_Z_FLOOR = depthBaseZ(0) + DRAG_MARGIN_Z_BACK;

function computeCellBounds(baseX: number, baseZ: number, depthReach: number, minZFloor = -Infinity): CityCellBounds {
  return {
    minX: baseX - (DISTRICT_SPACING / 2 - DRAG_MARGIN_X),
    maxX: baseX + (DISTRICT_SPACING / 2 - DRAG_MARGIN_X),
    // z only recedes backward from the tier's own front line (see the row-placement comment
    // below) — dragging "forward" past baseZ would encroach on the next, nearer tier.
    minZ: Math.max(minZFloor, baseZ - (DEPTH_SPACING * depthReach - DRAG_MARGIN_Z_BACK)),
    maxZ: baseZ,
  };
}

/** Snaps a raw dragged world position to the same LOT_SIZE grid the auto-layout itself uses
 * (aligned to the cell's own base point, not the world origin), then clamps it into bounds. */
export function snapCityPosition(rawX: number, rawZ: number, baseX: number, baseZ: number, bounds: CityCellBounds): CityPosition {
  const snappedX = baseX + Math.round((rawX - baseX) / LOT_SIZE) * LOT_SIZE;
  const snappedZ = baseZ + Math.round((rawZ - baseZ) / LOT_SIZE) * LOT_SIZE;
  return {
    x: Math.min(bounds.maxX, Math.max(bounds.minX, snappedX)),
    z: Math.min(bounds.maxZ, Math.max(bounds.minZ, snappedZ)),
  };
}

/**
 * Z-depth — liquidity where the category has one (savings/investment/pension), the time horizon
 * otherwise, unified into one axis as requested. Index 0 = nearest the camera, 2 = farthest —
 * locked/long-term recedes into the distance, liquid/current stays up close.
 */
export function depthIndex(entity: FinancialEntity): number {
  // donations get their own row, one step closer to the camera than every other category's
  // nearest ("immediate"/"current") row — a dedicated foreground lane, not folded into the
  // shared liquidity/horizon axis the rest of the city uses.
  if (entity.details.kind === 'donation') return 3;
  if (entity.liquidity === 'immediate') return 2;
  if (entity.liquidity === 'shortTerm') return 1;
  if (entity.liquidity === 'locked') return 0;
  const horizon = getHorizonBucket(entity);
  if (horizon === 'current') return 2;
  if (horizon === 'shortTerm') return 1;
  return 0;
}

const CATEGORY_INDEX: Record<EntityCategory, number> = Object.fromEntries(
  ENTITY_CATEGORIES.map((c, i) => [c, i]),
) as Record<EntityCategory, number>;

/**
 * Neighborhoods (categories) laid out along X, depth (liquidity/horizon) along Z, building height
 * is the amount — on a fixed ₪100–₪10,000,000 order-of-magnitude scale (computeMagnitudeShare),
 * not ranked against whatever else happens to be on this specific board. Rank-based sizing was
 * tried first, but its range gets shared across every entity's own pairwise gap — the more
 * entities on the board, the more it diluted any *specific* pair's difference, so a ₪1,000,000
 * pension next to a ₪25,000 one could end up looking only modestly taller once enough other
 * entities existed to eat up the "step budget". A fixed scale means a building's height reflects
 * what it's actually worth, stable regardless of how many other entities exist.
 */
export function computeCityLayout(entities: FinancialEntity[], overrides: Record<string, CityPosition> = {}): CityBuilding[] {
  const ctx = buildHealthContext(entities);
  const heightByEntity = new Map(
    entities.map((e) => {
      const isTree = isGrowthAssetDetails(e.details);
      // trees get their own floor/ceiling and their own narrower magnitude window
      // (computeTreeMagnitudeShare) — not the shared MIN_HEIGHT..MAX_HEIGHT scaled by a flat
      // multiplier, which ties the floor to MIN_HEIGHT*boost and can't be raised independently
      // of the ceiling.
      const height = isTree
        ? GROWTH_TREE_MIN_HEIGHT +
          computeTreeMagnitudeShare(getWeight(e)) * (CURVE_MAX_TREE_HEIGHT - GROWTH_TREE_MIN_HEIGHT) +
          Math.min(TREE_BIG_MONEY_MAX_BONUS, Math.max(0, Math.abs(getWeight(e)) - TREE_BIG_MONEY_THRESHOLD) / TREE_BIG_MONEY_SCALE)
        : MIN_HEIGHT + computeMagnitudeShare(Math.abs(getWeight(e))) * (MAX_HEIGHT - MIN_HEIGHT);
      return [e.id, height];
    }),
  );
  const footprintByEntity = new Map(
    entities.map((e) => [e.id, MIN_FOOTPRINT + computeMagnitudeShare(Math.abs(getWeight(e))) * (MAX_FOOTPRINT - MIN_FOOTPRINT)]),
  );

  const grouped = new Map<string, FinancialEntity[]>();
  for (const e of entities) {
    const key = `${e.details.kind}|${depthIndex(e)}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(e);
  }

  const buildings: CityBuilding[] = [];
  for (const [key, list] of grouped) {
    const [cat, depthStr] = key.split('|') as [EntityCategory, string];
    const depth = Number(depthStr);
    // reversed so the first category reads on the right, matching RTL flow.
    const baseX = (ENTITY_CATEGORIES.length - 1 - CATEGORY_INDEX[cat]) * DISTRICT_SPACING;
    const baseZ = depthBaseZ(depth);
    const cols = Math.max(1, Math.ceil(Math.sqrt(list.length)));
    const depthReach =
      depth === 0 ? LONG_TERM_DEPTH_REACH : depth === 1 ? SHORT_TERM_DEPTH_REACH : (DEPTH_REACH[cat] ?? DEFAULT_DEPTH_REACH);
    const cellBounds = computeCellBounds(baseX, baseZ, depthReach, depth === 1 ? SHORT_TERM_MIN_Z_FLOOR : -Infinity);
    const lotSize = depth === 1 ? SHORT_TERM_LOT_SIZE : LOT_SIZE;

    list.forEach((entity, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const healthOverride = getDisplayHealthOverride(entity);
      const health = healthOverride ?? computeHealth(entity, ctx);
      // a manual drag always wins over the auto col/row slot — re-clamped against this cell's
      // current bounds every render, so an override saved before a category/liquidity change
      // (which moves the whole cell) still lands somewhere valid instead of floating off in space.
      const override = overrides[entity.id];
      const autoX = baseX + (col - (cols - 1) / 2) * lotSize;
      // row 0 sits exactly on the tier's own line (the nearest-camera edge) and extra rows
      // recede backward, away from the camera — not forward toward the next, nearer tier. That
      // way a tier with many entities grows into its own depth instead of encroaching on the
      // gap meant to separate it from its neighbor.
      const autoZ = baseZ - row * lotSize;

      buildings.push({
        id: entity.id,
        name: entity.name,
        category: cat,
        x: override ? Math.min(cellBounds.maxX, Math.max(cellBounds.minX, override.x)) : autoX,
        z: override ? Math.min(cellBounds.maxZ, Math.max(cellBounds.minZ, override.z)) : autoZ,
        height: heightByEntity.get(entity.id)!,
        footprint: footprintByEntity.get(entity.id)!,
        color: HEALTH_COLORS[health],
        healthStatus: health,
        isAtRisk: healthOverride === null && health === 'risk',
        weight: Math.abs(getWeight(entity)),
        cellBounds,
      });
    });
  }

  return buildings;
}
