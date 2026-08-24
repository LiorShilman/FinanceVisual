import type { CityBuilding } from './city';
import type { FinancialEntity } from './entity';
import { GRID_CORNER_FAR_RIGHT } from './cityGrid';
import { computeMagnitudeShare } from './sizing';

export interface ValleyStreamSource {
  x: number;
  z: number;
  /** Raw amount — drives the stream's visual thickness. */
  weight: number;
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

// Debt drains the same way an expense does — the *ongoing* monthly payment is the actual drain
// (not the outstanding balance, which is a much bigger number that would swamp the expense
// streams and misrepresent the valley as "how much you owe" instead of "how much leaves every
// month"). Insurance is the same pattern again — the monthly premium is a real recurring
// outflow, same as any expense or debt payment; only its coverage amount (not sized here) is a
// held/held-for-later figure like a debt's outstanding balance, not a drain.
export function computeValleyFeature(buildings: CityBuilding[], entities: FinancialEntity[]): ValleyFeature {
  const entityById = new Map(entities.map((e) => [e.id, e]));
  const streams = buildings
    .filter((b) => b.category === 'expense' || b.category === 'debt' || b.category === 'insurance')
    .map((b) => {
      if (b.category === 'expense') return { x: b.x, z: b.z, weight: b.weight };
      const entity = entityById.get(b.id);
      if (b.category === 'debt') {
        return { x: b.x, z: b.z, weight: entity?.details.kind === 'debt' ? entity.details.monthlyPayment : 0 };
      }
      return { x: b.x, z: b.z, weight: entity?.details.kind === 'insurance' ? entity.details.monthlyPremium : 0 };
    })
    .filter((s) => s.weight > 0);
  const total = streams.reduce((sum, s) => sum + s.weight, 0);
  const radius = MIN_RADIUS + computeMagnitudeShare(total) * (MAX_RADIUS - MIN_RADIUS);
  // mirrors the lake's corner-tangent placement, just on the opposite (positive-x) edge.
  const center: [number, number] = [GRID_CORNER_FAR_RIGHT[0] - radius, GRID_CORNER_FAR_RIGHT[1] + radius];
  return { center, radius, streams };
}
