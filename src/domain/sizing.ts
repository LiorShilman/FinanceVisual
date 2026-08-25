import { type FinancialEntity, getWeight } from './entity';

export const MIN_NODE_SIZE = 84;
export const MAX_NODE_SIZE = 220;

export function computeTotalWeight(entities: FinancialEntity[]): number {
  return entities.reduce((sum, e) => sum + Math.abs(getWeight(e)), 0);
}

/**
 * Node diameter driven by an entity's share of total household "financial mass".
 * Deliberately mixes flows (income/expense) and stocks (balances) into one scale —
 * the point is a felt sense of relative weight on the board, not accounting precision.
 * sqrt compresses the range so a mortgage doesn't visually erase everything else.
 */
export function computeNodeSize(weight: number, totalWeight: number): number {
  if (totalWeight <= 0) return MIN_NODE_SIZE;
  const share = Math.max(Math.abs(weight), 0) / totalWeight;
  const scaled = Math.sqrt(share);
  const size = MIN_NODE_SIZE + scaled * (MAX_NODE_SIZE - MIN_NODE_SIZE);
  return Math.round(Math.min(MAX_NODE_SIZE, Math.max(MIN_NODE_SIZE, size)));
}

// An absolute (not "relative to whatever else happens to exist") order-of-magnitude scale.
// Comparing two amounts against a shared, fixed reference — instead of against "the current
// biggest item in this dataset" — means their relative sizing is stable and predictable no
// matter what else is on the board, and differences between two SMALL amounts stay visible
// instead of both being crushed toward the floor whenever one huge outlier exists.
const MIN_MAGNITUDE = 2; // ~100 ₪ and below reads as "the floor"
const MAX_MAGNITUDE = 7; // ~10,000,000 ₪ and above reads as "the ceiling"

/** 0..1 share of a fixed ₪100 – ₪10,000,000 order-of-magnitude range. */
export function computeMagnitudeShare(weight: number): number {
  const abs = Math.abs(weight);
  if (abs <= 0) return 0;
  const magnitude = Math.log10(abs + 1);
  return Math.max(0, Math.min(1, (magnitude - MIN_MAGNITUDE) / (MAX_MAGNITUDE - MIN_MAGNITUDE)));
}

