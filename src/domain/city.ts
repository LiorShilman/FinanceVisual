import { ENTITY_CATEGORIES, getWeight, type EntityCategory, type FinancialEntity } from './entity';
import { getHorizonBucket } from './layout';
import { buildHealthContext, computeHealth, getDisplayHealthOverride, HEALTH_COLORS, type HealthStatus } from './health';
import { computeMagnitudeShare } from './sizing';

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
const MAX_HEIGHT = 9;
const MIN_FOOTPRINT = 0.75;
const MAX_FOOTPRINT = 1.7;
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
// spaced like all the others — pushed back a full extra DEPTH_SPACING behind where the uniform
// grid would otherwise put it.
const LONG_TERM_EXTRA_GAP = DEPTH_SPACING;

/** The z-coordinate for a given depth tier — every tier is evenly spaced except tier 0
 * (locked/long-term), which gets pushed an extra DEPTH_SPACING further back. Exported so CityView
 * can derive matching ground/camera/label framing from the same single source of truth. */
export function depthBaseZ(depth: number): number {
  if (depth === 0) return -LONG_TERM_EXTRA_GAP;
  return depth * DEPTH_SPACING;
}

// How many depth tiers back (from its own auto-assigned one) a category's buildings can be
// dragged. Expenses always land in the same 'current' tier (getHorizonBucket has no per-entity
// variation for expenses, unlike debt/goal/investment etc.), so without this every expense would
// be stuck in one lane with no way to manually set any of them apart as more "short-term" — two
// tiers back reaches all the way to the adjacent short-term tier's own front line.
const DEPTH_REACH: Partial<Record<EntityCategory, number>> = { expense: 2 };

function computeCellBounds(baseX: number, baseZ: number, depthReach: number): CityCellBounds {
  return {
    minX: baseX - (DISTRICT_SPACING / 2 - DRAG_MARGIN_X),
    maxX: baseX + (DISTRICT_SPACING / 2 - DRAG_MARGIN_X),
    // z only recedes backward from the tier's own front line (see the row-placement comment
    // below) — dragging "forward" past baseZ would encroach on the next, nearer tier.
    minZ: baseZ - (DEPTH_SPACING * depthReach - DRAG_MARGIN_Z_BACK),
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
    entities.map((e) => [e.id, MIN_HEIGHT + computeMagnitudeShare(Math.abs(getWeight(e))) * (MAX_HEIGHT - MIN_HEIGHT)]),
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
    const cellBounds = computeCellBounds(baseX, baseZ, DEPTH_REACH[cat] ?? 1);

    list.forEach((entity, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const healthOverride = getDisplayHealthOverride(entity);
      const health = healthOverride ?? computeHealth(entity, ctx);
      // a manual drag always wins over the auto col/row slot — re-clamped against this cell's
      // current bounds every render, so an override saved before a category/liquidity change
      // (which moves the whole cell) still lands somewhere valid instead of floating off in space.
      const override = overrides[entity.id];
      const autoX = baseX + (col - (cols - 1) / 2) * LOT_SIZE;
      // row 0 sits exactly on the tier's own line (the nearest-camera edge) and extra rows
      // recede backward, away from the camera — not forward toward the next, nearer tier. That
      // way a tier with many entities grows into its own depth instead of encroaching on the
      // gap meant to separate it from its neighbor.
      const autoZ = baseZ - row * LOT_SIZE;

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
