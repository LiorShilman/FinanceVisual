import { getTerrainHeight } from '../../domain/terrain';

// well clear of everything that might pass underneath — not just the income circuit tubes
// (CityIncomeLinks, top around terrainY+0.14) and the water/valley streams (CityGround, top up
// to terrainY+0.78), but high enough that a label hanging below the deck also clears them, instead
// of sitting at the same height where those pipes/streams tend to cross.
const DECK_CLEARANCE = 5.5;

/** The checking bridge deck's own flat height — shared by CityCheckingBridge.tsx (the deck itself)
 * and CityCashRunway.tsx (which starts exactly at the deck's own zFar edge and has to land at the
 * identical Y, not a slightly different value recomputed from only one endpoint's terrain height).
 * Lives in its own plain-function file, not a component file, so both can import it without either
 * one exporting a non-component value (breaks React Fast Refresh — oxlint's
 * react(only-export-components)). */
export function computeCheckingDeckY(x: number, zNear: number, zFar: number): number {
  return Math.max(getTerrainHeight(x, zNear), getTerrainHeight(x, zFar)) + DECK_CLEARANCE;
}
