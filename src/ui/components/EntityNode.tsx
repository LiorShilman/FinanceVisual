import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useBoardStore } from '../../app/boardStore';
import { HEALTH_COLORS, getDisplayHealthOverride } from '../../domain/health';
import { getSecondaryDetail, getWeight, isFlowCategory } from '../../domain/entity';
import { CATEGORY_ICONS } from '../icons';
import { formatCurrencyMasked } from '../format';
import type { EntityFlowNode } from '../nodeTypes';
import styles from './EntityNode.module.css';

const SECONDARY_MIN_SIZE = 108;

export function EntityNode({ data }: NodeProps<EntityFlowNode>) {
  const { entity, size, health, onOpen } = data;
  const hideAmounts = useBoardStore((s) => s.hideAmounts);
  const color = HEALTH_COLORS[getDisplayHealthOverride(entity) ?? health];
  const secondary = size >= SECONDARY_MIN_SIZE ? getSecondaryDetail(entity) : null;
  const isFlow = isFlowCategory(entity);

  return (
    <div
      className={`${styles.node} ${isFlow ? styles.flowShape : ''}`}
      style={{ width: size, height: size, ['--node-color' as string]: color }}
      onClick={() => onOpen(entity.id)}
      title={`${entity.name} · ${formatCurrencyMasked(getWeight(entity), hideAmounts)}`}
    >
      <Handle id="tgt" type="target" position={Position.Top} className={styles.handle} isConnectable={false} />
      <span className={styles.icon}>{CATEGORY_ICONS[entity.details.kind]}</span>
      <span className={styles.name}>{entity.name}</span>
      <span className={styles.amount}>{formatCurrencyMasked(getWeight(entity), hideAmounts)}</span>
      {secondary && (
        <span className={styles.secondary}>
          {secondary.text ?? `${secondary.label}: ${formatCurrencyMasked(secondary.amount ?? 0, hideAmounts)}`}
        </span>
      )}
      <Handle id="src" type="source" position={Position.Bottom} className={styles.handle} isConnectable={false} />
    </div>
  );
}
