import type { CityBuilding } from './city';
import { GRID_CORNER_FAR_LEFT } from './cityGrid';
import { computeMagnitudeShare } from './sizing';

// same tributary, but a visibly different-colored one — pension's own stream reads as a distinct
// source feeding the same lake, not just more of the same liquid/investment water. Study funds
// pool with savings/investment (liquid) — unlike pension, they're a real user choice of liquidity,
// not a permanent lock, so they belong with the growth/investment grouping, not pension's.
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
    (b) => b.category === 'savings' || b.category === 'investment' || b.category === 'studyFund' || b.category === 'pension',
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
  const lakeCenter: [number, number] = [GRID_CORNER_FAR_LEFT[0] + totalRadius, GRID_CORNER_FAR_LEFT[1] + totalRadius];

  return { lakeCenter, lakeRadius, outerRingRadius: totalRadius, streams };
}
