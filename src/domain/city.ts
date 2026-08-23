import { ENTITY_CATEGORIES, getWeight, type EntityCategory, type FinancialEntity } from './entity';
import { getHorizonBucket } from './layout';
import { buildHealthContext, computeHealth, getDisplayHealthOverride, HEALTH_COLORS } from './health';
import { computeRankSizes } from './sizing';

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
  /** Raw amount (not the visually rank-scaled height/footprint) — for anything that needs to
   * compare true magnitudes across buildings, like the lake's liquid-vs-pension radius ratio. */
  weight: number;
  /** The drag-allowed area for this building's own category column + depth row — a manually
   * dragged position is always clamped to this, never free across the whole city. */
  cellBounds: CityCellBounds;
}

export const DISTRICT_SPACING = 6.5;
export const DEPTH_SPACING = 10.5;
const MIN_HEIGHT = 0.6;
const MAX_HEIGHT = 9;
const MIN_FOOTPRINT = 0.75;
const MAX_FOOTPRINT = 1.7;
// bigger than MAX_FOOTPRINT on purpose — equal values meant the biggest buildings in a district
// touched edge-to-edge with zero gap between them.
export const LOT_SIZE = 2.6;
// How far a manual drag is allowed to push a building past its auto-arranged cell before it'd
// visually collide with the neighboring category column or depth tier.
const DRAG_MARGIN_X = 1.0;
const DRAG_MARGIN_Z_BACK = 1.5;

function computeCellBounds(baseX: number, baseZ: number): CityCellBounds {
  return {
    minX: baseX - (DISTRICT_SPACING / 2 - DRAG_MARGIN_X),
    maxX: baseX + (DISTRICT_SPACING / 2 - DRAG_MARGIN_X),
    // z only recedes backward from the tier's own front line (see the row-placement comment
    // below) — dragging "forward" past baseZ would encroach on the next, nearer tier.
    minZ: baseZ - (DEPTH_SPACING - DRAG_MARGIN_Z_BACK),
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
function depthIndex(entity: FinancialEntity): number {
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
 * Neighborhoods (categories) laid out along X, depth (liquidity/horizon) along Z, building
 * height is the amount — ranked against every other building in the city (not a shared magnitude
 * scale), so two buildings of similar-but-not-identical value still read as different heights.
 */
export function computeCityLayout(entities: FinancialEntity[], overrides: Record<string, CityPosition> = {}): CityBuilding[] {
  const ctx = buildHealthContext(entities);
  const weights = entities.map((e) => Math.abs(getWeight(e)));
  const rankedHeights = computeRankSizes(weights, MIN_HEIGHT, MAX_HEIGHT);
  const rankedFootprints = computeRankSizes(weights, MIN_FOOTPRINT, MAX_FOOTPRINT);
  const heightByEntity = new Map(entities.map((e, i) => [e.id, rankedHeights[i]]));
  const footprintByEntity = new Map(entities.map((e, i) => [e.id, rankedFootprints[i]]));

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
    const baseZ = depth * DEPTH_SPACING;
    const cols = Math.max(1, Math.ceil(Math.sqrt(list.length)));
    const cellBounds = computeCellBounds(baseX, baseZ);

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
        weight: Math.abs(getWeight(entity)),
        cellBounds,
      });
    });
  }

  return buildings;
}
