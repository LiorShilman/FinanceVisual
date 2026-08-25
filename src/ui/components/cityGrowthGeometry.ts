// Pure sizing math shared between CityTreeMesh/CityCrystalMesh (which use it to build their own
// geometry) and CityView (which uses the exact same functions to anchor a medal badge's label
// right above whichever of these meshes an entity actually renders as) — kept out of either
// component file so neither one exports a non-component value (breaks Fast Refresh) and so the
// two can never drift out of sync with each other the way two independent hand-tuned formulas did.

export type TreeVariant = 'sapling' | 'oak' | 'pine' | 'fruit';

// blob count and color alone read as too similar at typical city-view distance — an overall size
// difference is the one cue that still holds up as a small silhouette. Savings stays a visibly
// young, small sapling; investment grows into a noticeably bigger, broader tree.
export const TREE_SIZE_SCALE: Record<TreeVariant, number> = { sapling: 0.62, oak: 1.2, pine: 1, fruit: 1 };

// the cap is set to exactly match `height*0.5`'s own value at `height`'s real ceiling
// (domain/city.ts's MAX_HEIGHT=9 → 4.5), not an arbitrary lower number — a cap of 3.4 started
// biting at height=6.8, so every entity ranked in the top quarter of the *whole city's* amount
// range (not just this category) rendered as the exact same tree regardless of how much bigger
// one actually was than another. Same growth rate as before, it just stops clipping early.
export function computeTrunkHeight(height: number, variant: TreeVariant): number {
  return Math.max(0.8, Math.min(4.5, height * 0.5)) * TREE_SIZE_SCALE[variant];
}

// same fix — capped at footprint and height's own combined ceiling (domain/city.ts's
// MAX_FOOTPRINT=1.7 and MAX_HEIGHT=9 → 1.36+0.45=1.81) instead of a lower number that let
// footprint alone (which is rank-scaled off the same amount) saturate this even earlier than
// trunkHeight did.
export function computeCanopyRadius(height: number, footprint: number, variant: TreeVariant): number {
  return Math.max(0.55, Math.min(1.82, footprint * 0.8 + height * 0.05)) * TREE_SIZE_SCALE[variant];
}

export function computeTreeLabelY(height: number, footprint: number, variant: TreeVariant): number {
  const trunkHeight = computeTrunkHeight(height, variant);
  const canopyRadius = computeCanopyRadius(height, footprint, variant);
  const canopyBaseY = trunkHeight + canopyRadius * 0.15;
  return variant === 'pine' ? trunkHeight + canopyRadius * 1.9 + 0.4 : canopyBaseY + canopyRadius * 1.15 + 0.4;
}

// caps set to exactly match each formula's own value at height/footprint's real ceiling
// (domain/city.ts's MAX_HEIGHT=9, MAX_FOOTPRINT=1.7) instead of an arbitrary lower number — the
// old 2.6/1.05 caps started biting well before the real maximum, so entities ranked in roughly
// the top third of the whole city's amount range all rendered as the same tree regardless of how
// much bigger one actually was than another.
export function computeCrystalTrunkHeight(height: number): number {
  return Math.max(0.8, Math.min(3.78, height * 0.42));
}

export function computeCrownMouthRadius(height: number, footprint: number): number {
  return Math.max(0.4, Math.min(2.6, height * 0.24 + footprint * 0.26));
}

export function computeCrystalLabelY(height: number, footprint: number): number {
  const trunkHeight = computeCrystalTrunkHeight(height);
  const crownMouthRadius = computeCrownMouthRadius(height, footprint);
  return trunkHeight + crownMouthRadius * 0.5 + crownMouthRadius + 0.7;
}
