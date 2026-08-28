import { DEPTH_SPACING } from './city';

// NOT tied to the long-term tier's own drag-reachable extreme (domain/city.ts's LONG_TERM_MIN_Z)
// — a first pass tried that, but GRID_SIZE is `max(cityWidth, CITY_DEPTH)+20`, and once
// CITY_DEPTH grew past cityWidth it started *dominating* GRID_SIZE too, which collapses the
// corner formula below (CITY_DEPTH/2 - GRID_SIZE/2) to a near-constant small offset regardless of
// how big CITY_DEPTH gets — the lake moved much closer instead of further away. The ground plane
// itself already grows to cover a dragged long-term entity separately (CityView's own minDepthZ),
// so the lake's own corner doesn't need to track that same extreme at all.
export const CITY_DEPTH = 2 * DEPTH_SPACING;

// an independent extra push on the corner's own z, on top of the standard corner position — kept
// separate from CITY_DEPTH/GRID_SIZE entirely (see the comment above) so it can move the lake
// further away predictably without touching either of those two shared values.
const LAKE_EXTRA_DISTANCE = 45;

/** The lake/valley's shared Z position — how far back (toward locked/long-term) they sit. Only Z:
 * their own X position is computed separately, directly against the real district edges (see
 * water.ts's/valley.ts's own computeWaterFeature/computeValleyFeature) with a guaranteed
 * clearance, not derived from this same width-dependent formula — that coupling (X and Z both
 * riding on one "grid size" number derived from the district width) was exactly what let the lake
 * drift into overlapping the district content once districts started shrinking individually: as
 * `cityWidth` shrank, the corner meant to keep the lake *outside* the grid moved inward right
 * along with it, without ever checking whether real district content had also moved in that same
 * direction. */
export function computeGridZ(cityWidth: number): number {
  const gridSize = Math.max(cityWidth, CITY_DEPTH) + 20;
  return CITY_DEPTH / 2 - gridSize / 2 - LAKE_EXTRA_DISTANCE;
}

export interface CircularExtent {
  center: [number, number];
  radius: number;
}

/** The ground plane (and the matching grid CityView draws) must contain the district rectangle
 * plus every ground-level feature (lake, valley, …) — several of which now sit right at, and
 * slightly past, the district grid's own corners. Takes independent X/Z sizes, not one shared
 * square size — the depth axis needs real room for long-term's own theoretical max drag reach
 * (domain/city.ts's LONG_TERM_MIN_Z, a large constant regardless of how populated the board
 * actually is) while the width axis now shrinks to whatever the districts actually need (see
 * computeDistrictSpan) — forcing both into one square size meant the width axis got padded out to
 * match the depth axis's own much bigger constant, leaving wide empty margins on both sides once
 * a real board's width dropped well below that. */
export function computeGroundBounds(groundCenter: [number, number], sizeX: number, sizeZ: number, extents: CircularExtent[]) {
  let minX = groundCenter[0] - sizeX / 2;
  let maxX = groundCenter[0] + sizeX / 2;
  let minZ = groundCenter[1] - sizeZ / 2;
  let maxZ = groundCenter[1] + sizeZ / 2;
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
