import { useEffect, useState } from 'react';
import { LAYOUT_MODES, LAYOUT_MODE_LABELS, type LayoutMode } from '../../domain/layout';
import styles from './LayoutSwitcher.module.css';

// matches BoardScreen.module.css's own mobile query exactly — a narrow portrait phone hits the
// width clause, a phone rotated to landscape (wide but short) hits the height+orientation one.
const MOBILE_QUERY = '(max-width: 760px), (max-height: 500px) and (orientation: landscape)';
// the bucketed layouts (pyramid/liquidity/horizon/family) lay entities out in side-by-side
// columns that assume a wide screen — on a phone only the freeform board and the 3D city hold up.
const MOBILE_MODES: readonly LayoutMode[] = ['free', 'city'];

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches);
  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setIsMobile(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return isMobile;
}

interface Props {
  value: LayoutMode;
  onChange: (mode: LayoutMode) => void;
}

export function LayoutSwitcher({ value, onChange }: Props) {
  const isMobile = useIsMobile();
  const modes = isMobile ? MOBILE_MODES : LAYOUT_MODES;

  // a layout mode saved from a previous desktop session (e.g. 'byMember') has nowhere to go on a
  // phone — fall back to the freeform board rather than rendering a bucketed layout no touch
  // screen has room for.
  useEffect(() => {
    if (isMobile && !MOBILE_MODES.includes(value)) onChange('free');
  }, [isMobile, value, onChange]);

  return (
    <div className={styles.switcher}>
      {modes.map((mode) => (
        <button
          key={mode}
          type="button"
          className={`${styles.btn} ${mode === value ? styles.btnActive : ''}`}
          onClick={() => onChange(mode)}
        >
          {LAYOUT_MODE_LABELS[mode]}
        </button>
      ))}
    </div>
  );
}
