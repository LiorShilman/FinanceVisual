import type { CityBuilding } from './city';
import type { FinancialEntity } from './entity';
import { computeMagnitudeShare } from './sizing';

// expense is split into 'need'/'want' — a non-essential expense isn't the same kind of drain as
// an essential one (see health.ts's own 'want' status and CityExpenseMesh's own color use), so
// its stream shouldn't share the identical red either.
export type ValleyStreamKind = 'expenseNeed' | 'expenseWant' | 'debt' | 'insurance';

export interface ValleyStreamSource {
  x: number;
  z: number;
  /** Raw amount — drives the stream's visual thickness. */
  weight: number;
  /** Which of the draining categories this came from — expense/debt/insurance are all real
   * recurring outflows into the same valley, but they aren't the same *kind* of outflow (a debt
   * payment retires a liability, an insurance premium buys real coverage, a non-essential expense
   * is a choice rather than an unavoidable cost — neither is the same as a plain essential
   * expense's own pure loss), so CityGround colors each stream by this instead of painting every
   * one the same flat red. */
  kind: ValleyStreamKind;
}

export interface ValleyFeature {
  center: [number, number];
  radius: number;
  streams: ValleyStreamSource[];
}

// Money spent doesn't pool like savings — it drains away. A canyon, not a lake: on the mirror
// corner of the grid (expense/income side), fed by every expense, sized by the same fixed ₪
// scale as the lake so the two read as comparable "how much" gauges.
const MIN_RADIUS = 2;
const MAX_RADIUS = 7;
// same idea as water.ts's own LAKE_CONTENT_GAP — guaranteed clearance from the real rightmost
// district edge, reserved against MAX_RADIUS (the worst case) rather than today's actual radius.
const VALLEY_CONTENT_GAP = 4;

// Debt drains the same way an expense does — the *ongoing* monthly payment is the actual drain
// (not the outstanding balance, which is a much bigger number that would swamp the expense
// streams and misrepresent the valley as "how much you owe" instead of "how much leaves every
// month"). Insurance is the same pattern again — the monthly premium is a real recurring
// outflow, same as any expense or debt payment; only its coverage amount (not sized here) is a
// held/held-for-later figure like a debt's outstanding balance, not a drain. `districtMaxX` is the
// real rightmost edge of the populated districts (see domain/city.ts's computeDistrictSpan) — the
// valley is placed just outside it, mirroring water.ts's own lake placement. */
export function computeValleyFeature(
  buildings: CityBuilding[],
  entities: FinancialEntity[],
  districtMaxX: number,
  z: number,
): ValleyFeature {
  const entityById = new Map(entities.map((e) => [e.id, e]));
  const streams = buildings
    .filter((b) => b.category === 'expense' || b.category === 'debt' || b.category === 'insurance')
    .map((b): ValleyStreamSource => {
      const entity = entityById.get(b.id);
      if (b.category === 'expense') {
        const essential = entity?.details.kind === 'expense' ? entity.details.essential : true;
        return { x: b.x, z: b.z, weight: b.weight, kind: essential ? 'expenseNeed' : 'expenseWant' };
      }
      if (b.category === 'debt') {
        return { x: b.x, z: b.z, weight: entity?.details.kind === 'debt' ? entity.details.monthlyPayment : 0, kind: 'debt' };
      }
      return { x: b.x, z: b.z, weight: entity?.details.kind === 'insurance' ? entity.details.monthlyPremium : 0, kind: 'insurance' };
    })
    .filter((s) => s.weight > 0);
  const total = streams.reduce((sum, s) => sum + s.weight, 0);
  const radius = MIN_RADIUS + computeMagnitudeShare(total) * (MAX_RADIUS - MIN_RADIUS);
  const farRightX = districtMaxX + VALLEY_CONTENT_GAP + MAX_RADIUS * 2;
  const center: [number, number] = [farRightX - radius, z + radius];
  return { center, radius, streams };
}
