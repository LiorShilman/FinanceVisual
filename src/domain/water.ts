import { DISTRICT_SPACING, DEPTH_SPACING, type CityBuilding } from './city';
import { ENTITY_CATEGORIES } from './entity';
import { computeMagnitudeShare } from './sizing';

// same tributary, but a visibly different-colored one — pension's own stream reads as a
// distinct source feeding the same lake, not just more of the same liquid/investment water.
export type StreamKind = 'liquid' | 'pension';

export interface StreamSource {
  x: number;
  z: number;
  kind: StreamKind;
}

export interface WaterFeature {
  lakeCenter: [number, number];
  /** Inner pool — savings/investment. */
  lakeRadius: number;
  /** Outer halo surrounding the inner pool — pension. */
  outerRingRadius: number;
  streams: StreamSource[];
}

// The lake anchors to the grid's own farthest corner (not an arbitrary offset past the district)
// — same width/depth/size math CityView uses for its gridHelper, so the two stay in lockstep.
const CITY_WIDTH = (ENTITY_CATEGORIES.length - 1) * DISTRICT_SPACING;
const CITY_DEPTH = 2 * DEPTH_SPACING;
const GRID_SIZE = Math.max(CITY_WIDTH, CITY_DEPTH) + 20;
const GRID_CORNER: [number, number] = [CITY_WIDTH / 2 - GRID_SIZE / 2, CITY_DEPTH / 2 - GRID_SIZE / 2];

// The lake's overall size (not just the inner/outer split) grows with real wealth — a fixed
// absolute ₪ scale (same philosophy as sizing.ts's magnitude share), not relative to anything
// else on the board, so "my capital grew" always visibly grows the lake.
const MIN_TOTAL_RADIUS = 2.5;
const MAX_TOTAL_RADIUS = 9;
const MIN_SHARE = 0.22; // neither pool ever visually vanishes, even if one side is empty

/** Every savings/investment/pension building feeds a stream into the corner lake — liquid money
 * pools in the inner circle, pension money pools in the ring around it. The ring/lake split is
 * proportional to how much money is actually in each (by area, so the ring's true visual "amount"
 * is the area between the two radii, not the radius itself); the lake's overall size reflects the
 * combined total. */
export function computeWaterFeature(buildings: CityBuilding[]): WaterFeature {
  const relevant = buildings.filter(
    (b) => b.category === 'savings' || b.category === 'investment' || b.category === 'pension',
  );
  const streams = relevant.map((b) => ({
    x: b.x,
    z: b.z,
    kind: (b.category === 'pension' ? 'pension' : 'liquid') as StreamKind,
  }));

  const liquidTotal = relevant.filter((b) => b.category !== 'pension').reduce((sum, b) => sum + b.weight, 0);
  const pensionTotal = relevant.filter((b) => b.category === 'pension').reduce((sum, b) => sum + b.weight, 0);
  const total = liquidTotal + pensionTotal;
  const liquidShare = total > 0 ? Math.min(1 - MIN_SHARE, Math.max(MIN_SHARE, liquidTotal / total)) : 0.5;

  const totalRadius = MIN_TOTAL_RADIUS + computeMagnitudeShare(total) * (MAX_TOTAL_RADIUS - MIN_TOTAL_RADIUS);
  const lakeRadius = totalRadius * Math.sqrt(liquidShare);
  // centered so the outer ring is tangent to the grid's corner from the inside — the whole lake
  // stays drawn on the grid instead of half-spilling into the empty space past its edge, however
  // big it currently is.
  const lakeCenter: [number, number] = [GRID_CORNER[0] + totalRadius, GRID_CORNER[1] + totalRadius];

  return { lakeCenter, lakeRadius, outerRingRadius: totalRadius, streams };
}

/** The ground plane (and the matching grid CityView draws) must contain both the district square
 * and the lake, which sits right at — and slightly past — the district grid's own corner. */
export function computeGroundBounds(groundCenter: [number, number], groundSize: number, water: WaterFeature) {
  const [lakeX, lakeZ] = water.lakeCenter;
  const districtMinX = groundCenter[0] - groundSize / 2;
  const districtMaxX = groundCenter[0] + groundSize / 2;
  const districtMinZ = groundCenter[1] - groundSize / 2;
  const districtMaxZ = groundCenter[1] + groundSize / 2;
  const minX = Math.min(districtMinX, lakeX - water.outerRingRadius - 3);
  const maxX = Math.max(districtMaxX, lakeX + water.outerRingRadius + 3);
  const minZ = Math.min(districtMinZ, lakeZ - water.outerRingRadius - 3);
  const maxZ = Math.max(districtMaxZ, lakeZ + water.outerRingRadius + 3);
  return {
    width: maxX - minX,
    depth: maxZ - minZ,
    center: [(minX + maxX) / 2, (minZ + maxZ) / 2] as [number, number],
  };
}
