import { ENTITY_CATEGORIES, getWeight, type EntityCategory, type FinancialEntity } from './entity';
import { getHorizonBucket } from './layout';
import { buildHealthContext, computeHealth, getDisplayHealthOverride, HEALTH_COLORS } from './health';
import { computeRankSizes } from './sizing';

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
}

export const DISTRICT_SPACING = 6.5;
export const DEPTH_SPACING = 7;
const MIN_HEIGHT = 0.6;
const MAX_HEIGHT = 9;
const MIN_FOOTPRINT = 0.75;
const MAX_FOOTPRINT = 1.7;
const LOT_SIZE = 1.7;

/**
 * Z-depth — liquidity where the category has one (savings/investment/pension), the time horizon
 * otherwise, unified into one axis as requested. Index 0 = nearest the camera, 2 = farthest —
 * locked/long-term recedes into the distance, liquid/current stays up close.
 */
function depthIndex(entity: FinancialEntity): number {
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
export function computeCityLayout(entities: FinancialEntity[]): CityBuilding[] {
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

    list.forEach((entity, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const healthOverride = getDisplayHealthOverride(entity);
      const health = healthOverride ?? computeHealth(entity, ctx);

      buildings.push({
        id: entity.id,
        name: entity.name,
        category: cat,
        x: baseX + (col - (cols - 1) / 2) * LOT_SIZE,
        z: baseZ + row * LOT_SIZE,
        height: heightByEntity.get(entity.id)!,
        footprint: footprintByEntity.get(entity.id)!,
        color: HEALTH_COLORS[health],
        weight: Math.abs(getWeight(entity)),
      });
    });
  }

  return buildings;
}
