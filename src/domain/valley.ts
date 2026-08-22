import type { CityBuilding } from './city';
import { GRID_CORNER_FAR_RIGHT } from './cityGrid';
import { computeMagnitudeShare } from './sizing';

export interface ValleyStreamSource {
  x: number;
  z: number;
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

export function computeValleyFeature(buildings: CityBuilding[]): ValleyFeature {
  const expenseBuildings = buildings.filter((b) => b.category === 'expense');
  const total = expenseBuildings.reduce((sum, b) => sum + b.weight, 0);
  const radius = MIN_RADIUS + computeMagnitudeShare(total) * (MAX_RADIUS - MIN_RADIUS);
  // mirrors the lake's corner-tangent placement, just on the opposite (positive-x) edge.
  const center: [number, number] = [GRID_CORNER_FAR_RIGHT[0] - radius, GRID_CORNER_FAR_RIGHT[1] + radius];
  const streams = expenseBuildings.map((b) => ({ x: b.x, z: b.z }));
  return { center, radius, streams };
}
