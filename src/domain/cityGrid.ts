import { DISTRICT_SPACING, DEPTH_SPACING } from './city';
import { ENTITY_CATEGORIES } from './entity';

// Shared by every ground-level feature (lake, valley, the grid itself) so they all agree on the
// same city footprint instead of each recomputing it slightly differently.
export const CITY_WIDTH = (ENTITY_CATEGORIES.length - 1) * DISTRICT_SPACING;
export const CITY_DEPTH = 2 * DEPTH_SPACING;
export const GRID_SIZE = Math.max(CITY_WIDTH, CITY_DEPTH) + 20;

/** Far corner near realEstate/goal/debt (low x) and locked/long-term (low z) — where the lake sits. */
export const GRID_CORNER_FAR_LEFT: [number, number] = [CITY_WIDTH / 2 - GRID_SIZE / 2, CITY_DEPTH / 2 - GRID_SIZE / 2];
/** Far corner near source/income/expense (high x) and locked/long-term (low z) — mirror of the above. */
export const GRID_CORNER_FAR_RIGHT: [number, number] = [CITY_WIDTH / 2 + GRID_SIZE / 2, CITY_DEPTH / 2 - GRID_SIZE / 2];

export interface CircularExtent {
  center: [number, number];
  radius: number;
}

/** The ground plane (and the matching grid CityView draws) must contain the district square plus
 * every ground-level feature (lake, valley, …) — several of which now sit right at, and slightly
 * past, the district grid's own corners. */
export function computeGroundBounds(groundCenter: [number, number], groundSize: number, extents: CircularExtent[]) {
  let minX = groundCenter[0] - groundSize / 2;
  let maxX = groundCenter[0] + groundSize / 2;
  let minZ = groundCenter[1] - groundSize / 2;
  let maxZ = groundCenter[1] + groundSize / 2;
  for (const { center: [cx, cz], radius } of extents) {
    minX = Math.min(minX, cx - radius - 3);
    maxX = Math.max(maxX, cx + radius + 3);
    minZ = Math.min(minZ, cz - radius - 3);
    maxZ = Math.max(maxZ, cz + radius + 3);
  }
  return {
    width: maxX - minX,
    depth: maxZ - minZ,
    center: [(minX + maxX) / 2, (minZ + maxZ) / 2] as [number, number],
  };
}
