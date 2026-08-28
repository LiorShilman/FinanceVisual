import type { CityBuilding } from './city';
import type { FinancialEntity } from './entity';
import { computeMagnitudeShare } from './sizing';

// same tributary, but a visibly different-colored one — pension's own stream reads as a distinct
// source feeding the same lake, not just more of the same liquid/investment water. Study funds
// pool with savings/investment (liquid) — unlike pension, they're a real user choice of liquidity,
// not a permanent lock, so they belong with the growth/investment grouping, not pension's. Checking
// gets its own third color too (see CityGround.tsx) — it's still counted as liquid money for the
// lake's own radius/share math below, just tinted differently so day-to-day cash reads as visibly
// distinct from money actually earmarked for savings/investment.
export type StreamKind = 'liquid' | 'checking' | 'pension';

export interface StreamSource {
  x: number;
  z: number;
  kind: StreamKind;
  /** Raw amount — drives the stream's visual thickness. */
  weight: number;
  /** Whether this money is actively being topped up every month — savings/investment/pension/
   * study-fund entities carry their own `monthlyContribution`; checking has no such concept (it's
   * day-to-day cash, not a growth deposit that can go dormant), so it's always treated as active.
   * Drives whether the stream gets the animated flowing treatment or reads as a calm, static feed
   * (see CityGround.tsx) — this is the first place that distinction actually reaches the screen;
   * every category's own *displayed* health color is a flat per-category override that ignores it
   * (see health.ts's getDisplayHealthOverride). */
  hasMonthlyContribution: boolean;
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
// guaranteed clearance between the lake's own rightmost edge and the real leftmost district's own
// edge — reserved for the *worst case* (MAX_TOTAL_RADIUS, not today's actual, smaller radius), so
// the lake never creeps closer to the district content even as the board's own wealth (and thus
// the lake's own size) grows over time.
const LAKE_CONTENT_GAP = 4;

/** Every checking/savings/investment/pension building feeds a stream into the corner lake —
 * liquid money pools in the inner circle, pension money pools in the ring around it. Checking is
 * included alongside savings — it's still liquid money, just held for day-to-day spending rather
 * than growth; leaving it out made a checking account render as an unconnected building with no
 * link to the rest of the city's money story at all. The ring/lake split is proportional to how
 * much money is actually in each (by area, so the ring's true visual "amount" is the area between
 * the two radii, not the radius itself); the lake's overall size reflects the combined total.
 * `districtMinX` is the real leftmost edge of the populated districts (see domain/city.ts's
 * computeDistrictSpan) — the lake is placed just outside it, not at some flat corner formula that
 * can drift into overlapping the content once districts shrink individually. */
export function computeWaterFeature(
  buildings: CityBuilding[],
  entities: FinancialEntity[],
  districtMinX: number,
  z: number,
): WaterFeature {
  const entityById = new Map(entities.map((e) => [e.id, e]));
  const relevant = buildings.filter(
    (b) =>
      b.category === 'checking' ||
      b.category === 'savings' ||
      b.category === 'investment' ||
      b.category === 'studyFund' ||
      b.category === 'pension',
  );
  const streams = relevant.map((b) => {
    const d = entityById.get(b.id)?.details;
    const hasMonthlyContribution =
      d?.kind === 'savings' || d?.kind === 'investment' || d?.kind === 'pension' || d?.kind === 'studyFund' ? d.monthlyContribution > 0 : true;
    return {
      x: b.x,
      z: b.z,
      kind: (b.category === 'pension' ? 'pension' : b.category === 'checking' ? 'checking' : 'liquid') as StreamKind,
      weight: b.weight,
      hasMonthlyContribution,
    };
  });

  const liquidTotal = relevant.filter((b) => b.category !== 'pension').reduce((sum, b) => sum + b.weight, 0);
  const pensionTotal = relevant.filter((b) => b.category === 'pension').reduce((sum, b) => sum + b.weight, 0);
  const total = liquidTotal + pensionTotal;
  const liquidShare = total > 0 ? Math.min(1 - MIN_SHARE, Math.max(MIN_SHARE, liquidTotal / total)) : 0.5;

  const totalRadius = MIN_TOTAL_RADIUS + computeMagnitudeShare(total) * (MAX_TOTAL_RADIUS - MIN_TOTAL_RADIUS);
  const lakeRadius = totalRadius * Math.sqrt(liquidShare);
  // the lake's own rightmost edge sits LAKE_CONTENT_GAP clear of the real district content,
  // regardless of the lake's actual radius today — reserving room for MAX_TOTAL_RADIUS (not just
  // totalRadius) guarantees that even as the lake grows with the board's own wealth, it never
  // creeps past this same safe line.
  const farLeftX = districtMinX - LAKE_CONTENT_GAP - MAX_TOTAL_RADIUS * 2;
  const lakeCenter: [number, number] = [farLeftX + totalRadius, z + totalRadius];

  return { lakeCenter, lakeRadius, outerRingRadius: totalRadius, streams };
}
