import { useMemo } from 'react';
import type { FinancialEntity } from '../../domain/entity';
import { computeTierFillRatios, PYRAMID_TIERS, PYRAMID_TIER_COLORS } from '../../domain/pyramidTiers';
import styles from './PyramidBadge.module.css';

interface Props {
  entities: FinancialEntity[];
  onClick: () => void;
}

/** A compact, always-visible health summary that lives in the header — never floats over the canvas. */
export function PyramidBadge({ entities, onClick }: Props) {
  const fillByTier = useMemo(() => computeTierFillRatios(entities), [entities]);

  return (
    <button type="button" className={styles.wrap} onClick={onClick} title="בריאות פיננסית — לחץ להצגת הפירמידה המלאה">
      <span className={styles.title}>בריאות פיננסית</span>
      <div className={styles.stack}>
        {PYRAMID_TIERS.map((tier) => (
          <div
            key={tier}
            className={styles.band}
            style={{
              height: `${Math.round(Math.min(1, fillByTier[tier]) * 70 + 15)}%`,
              ['--band-color' as string]: PYRAMID_TIER_COLORS[tier],
              ['--fill-pct' as string]: `${Math.round(Math.min(1, fillByTier[tier]) * 55 + 15)}%`,
            }}
          />
        ))}
      </div>
    </button>
  );
}
