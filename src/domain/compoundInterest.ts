export interface GrowthProjectionPoint {
  year: number;
  balance: number;
}

/**
 * Monthly-compounding projection, sampled at each year boundary (including year 0, the starting
 * balance) — monthly compounding rather than annual because a real deposit-then-grow account
 * compounds on every contribution as it lands, not just once a year, so this reads truer to what
 * an actual growing balance does.
 */
export function computeGrowthProjection(
  startBalance: number,
  monthlyDeposit: number,
  annualReturnPct: number,
  years: number,
): GrowthProjectionPoint[] {
  const monthlyRate = annualReturnPct / 100 / 12;
  const points: GrowthProjectionPoint[] = [{ year: 0, balance: startBalance }];
  let balance = startBalance;
  for (let year = 1; year <= years; year++) {
    for (let m = 0; m < 12; m++) {
      balance = balance * (1 + monthlyRate) + monthlyDeposit;
    }
    points.push({ year, balance });
  }
  return points;
}
