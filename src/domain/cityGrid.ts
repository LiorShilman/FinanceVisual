import { DISTRICT_SPACING, DEPTH_SPACING } from './city';
import { ENTITY_CATEGORIES } from './entity';

// Shared by every ground-level feature (lake, valley, the grid itself) so they all agree on the
// same city footprint instead of each recomputing it slightly differently.
export const CITY_WIDTH = (ENTITY_CATEGORIES.length - 1) * DISTRICT_SPACING;
// NOT tied to the long-term tier's own drag-reachable extreme (domain/city.ts's LONG_TERM_MIN_Z)
// — a first pass tried that, but GRID_SIZE is `max(CITY_WIDTH, CITY_DEPTH)+20`, and once
// CITY_DEPTH grew past CITY_WIDTH it started *dominating* GRID_SIZE too, which collapses the
// corner formula below (CITY_DEPTH/2 - GRID_SIZE/2) to a near-constant small offset regardless of
// how big CITY_DEPTH gets — the lake moved much closer instead of further away. The ground plane
// itself already grows to cover a dragged long-term entity separately (CityView's own minDepthZ),
// so the lake's own corner doesn't need to track that same extreme at all.
export const CITY_DEPTH = 2 * DEPTH_SPACING;
export const GRID_SIZE = Math.max(CITY_WIDTH, CITY_DEPTH) + 20;

// an independent extra push on the corner's own z, on top of the standard corner position — kept
// separate from CITY_DEPTH/GRID_SIZE entirely (see the comment above) so it can move the lake
// further away predictably without touching either of those two shared values.
const LAKE_EXTRA_DISTANCE = 45;
const cornerZ = CITY_DEPTH / 2 - GRID_SIZE / 2 - LAKE_EXTRA_DISTANCE;
/** Far corner near realEstate/goal/debt (low x) and locked/long-term (low z) — where the lake sits. */
export const GRID_CORNER_FAR_LEFT: [number, number] = [CITY_WIDTH / 2 - GRID_SIZE / 2, cornerZ];
/** Far corner near source/income/expense (high x) and locked/long-term (low z) — mirror of the above. */
export const GRID_CORNER_FAR_RIGHT: [number, number] = [CITY_WIDTH / 2 + GRID_SIZE / 2, cornerZ];

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
