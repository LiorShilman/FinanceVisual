import { type FinancialEntity, getWeight } from './entity';

export const PYRAMID_TIERS = ['foundation', 'protection', 'retirement', 'growth', 'peak'] as const;
export type PyramidTier = (typeof PYRAMID_TIERS)[number];

/** Reference shape for a balanced household — bottom-heavy, sums to 1. */
export const IDEAL_TIER_DISTRIBUTION: Record<PyramidTier, number> = {
  foundation: 0.1,
  protection: 0.15,
  retirement: 0.3,
  growth: 0.3,
  peak: 0.15,
};

/** Only entities that represent stored wealth/protection belong on the pyramid — flows, debts and goals don't. */
export function getEntityTier(entity: FinancialEntity): PyramidTier | null {
  const d = entity.details;
  switch (d.kind) {
    case 'savings':
      return d.isEmergencyFund ? 'foundation' : 'growth';
    case 'insurance':
      return 'protection';
    case 'pension':
      return 'retirement';
    case 'investment':
    case 'studyFund':
      return 'growth';
    case 'realEstate':
      return 'peak';
    default:
      return null;
  }
}

export function computeTierWeights(entities: FinancialEntity[]): Record<PyramidTier, number> {
  const weights: Record<PyramidTier, number> = { foundation: 0, protection: 0, retirement: 0, growth: 0, peak: 0 };
  for (const e of entities) {
    const tier = getEntityTier(e);
    if (!tier) continue;
    weights[tier] += Math.abs(getWeight(e));
  }
  return weights;
}

/**
 * How far the actual tier distribution deviates from the ideal shape, normalized to [0,1].
 * Drives the background pyramid's "wobble" — a heavy top with an empty foundation should read as unstable.
 */
export function computeImbalanceScore(entities: FinancialEntity[]): number {
  const weights = computeTierWeights(entities);
  const total = PYRAMID_TIERS.reduce((sum, t) => sum + weights[t], 0);
  if (total <= 0) return 0;

  let deviation = 0;
  for (const tier of PYRAMID_TIERS) {
    const actualShare = weights[tier] / total;
    deviation += Math.abs(actualShare - IDEAL_TIER_DISTRIBUTION[tier]);
  }
  // max possible deviation across two distributions over the same support is 2
  return Math.min(1, deviation / 2);
}
