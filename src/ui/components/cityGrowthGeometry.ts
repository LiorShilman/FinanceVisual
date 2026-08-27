// Pure sizing math shared between CityTreeMesh/CityCrystalMesh (which use it to build their own
// geometry) and CityView (which uses the exact same functions to anchor a medal badge's label
// right above whichever of these meshes an entity actually renders as) — kept out of either
// component file so neither one exports a non-component value (breaks Fast Refresh) and so the
// two can never drift out of sync with each other the way two independent hand-tuned formulas did.

import { MAX_FOOTPRINT, MAX_TREE_HEIGHT } from '../../domain/city';

export type TreeVariant = 'sapling' | 'oak' | 'pine' | 'fruit';

// blob count and color alone read as too similar at typical city-view distance — an overall size
// difference is the one cue that still holds up as a small silhouette. Savings stays a visibly
// young, small sapling; investment grows into a noticeably bigger, broader tree.
export const TREE_SIZE_SCALE: Record<TreeVariant, number> = { sapling: 0.62, oak: 1.2, pine: 1, fruit: 1 };

// the cap is set to exactly match `height*0.5`'s own value at a tree's real ceiling (imported
// MAX_TREE_HEIGHT, not a copied-in number) — a stale copy of this cap was exactly what let two
// very different real balances (e.g. ₪200K and ₪1M) render as the literal same tree once
// domain/city.ts's own boosted-tree height formula moved past whatever ceiling this was last
// calibrated against. Importing the real constant means the two can't drift apart again.
export function computeTrunkHeight(height: number, variant: TreeVariant): number {
  return Math.max(0.8, Math.min(MAX_TREE_HEIGHT * 0.5, height * 0.5)) * TREE_SIZE_SCALE[variant];
}

// same fix — capped at footprint and a tree's own real height ceiling, both imported.
export function computeCanopyRadius(height: number, footprint: number, variant: TreeVariant): number {
  return Math.max(0.55, Math.min(MAX_FOOTPRINT * 0.8 + MAX_TREE_HEIGHT * 0.05, footprint * 0.8 + height * 0.05)) * TREE_SIZE_SCALE[variant];
}

// blended from both footprint and height (like computeCanopyRadius) — footprint alone barely
// varies across the tree category's own much-wider height range, so a trunk sized off footprint
// only stayed nearly the same thin width regardless of how dramatically taller the boosted-height
// formula in domain/city.ts made the tree above it. A tall tree with a thin trunk read as
// structurally wrong, not just "less differentiated."
export function computeTrunkRadius(height: number, footprint: number, variant: TreeVariant): number {
  return Math.max(0.1, Math.min(MAX_FOOTPRINT * 0.09 + MAX_TREE_HEIGHT * 0.025, footprint * 0.09 + height * 0.025)) * TREE_SIZE_SCALE[variant];
}

export function computeTreeLabelY(height: number, footprint: number, variant: TreeVariant): number {
  const trunkHeight = computeTrunkHeight(height, variant);
  const canopyRadius = computeCanopyRadius(height, footprint, variant);
  const canopyBaseY = trunkHeight + canopyRadius * 0.15;
  return variant === 'pine' ? trunkHeight + canopyRadius * 1.9 + 0.4 : canopyBaseY + canopyRadius * 1.15 + 0.4;
}

// caps set to exactly match each formula's own value at height/footprint's real ceiling
// (imported MAX_TREE_HEIGHT/MAX_FOOTPRINT — an alternative investment is still a growth asset, so
// it gets the same boosted height as every other tree) instead of a copied-in number that can
// drift out of sync with the real ceiling.
export function computeCrystalTrunkHeight(height: number): number {
  return Math.max(0.8, Math.min(MAX_TREE_HEIGHT * 0.42, height * 0.42));
}

export function computeCrownMouthRadius(height: number, footprint: number): number {
  return Math.max(0.4, Math.min(MAX_TREE_HEIGHT * 0.24 + MAX_FOOTPRINT * 0.26, height * 0.24 + footprint * 0.26));
}

// same fix as computeTrunkRadius, for the crystal "tree" an alternative investment renders as.
export function computeCrystalTrunkRadius(height: number, footprint: number): number {
  return Math.max(0.09, Math.min(MAX_FOOTPRINT * 0.08 + MAX_TREE_HEIGHT * 0.02, footprint * 0.08 + height * 0.02));
}

export function computeCrystalLabelY(height: number, footprint: number): number {
  const trunkHeight = computeCrystalTrunkHeight(height);
  const crownMouthRadius = computeCrownMouthRadius(height, footprint);
  return trunkHeight + crownMouthRadius * 0.5 + crownMouthRadius + 0.7;
}
