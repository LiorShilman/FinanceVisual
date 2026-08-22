import { LAYOUT_MODES, LAYOUT_MODE_LABELS, type LayoutMode } from '../../domain/layout';
import styles from './LayoutSwitcher.module.css';

interface Props {
  value: LayoutMode;
  onChange: (mode: LayoutMode) => void;
}

export function LayoutSwitcher({ value, onChange }: Props) {
  return (
    <div className={styles.switcher}>
      {LAYOUT_MODES.map((mode) => (
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
