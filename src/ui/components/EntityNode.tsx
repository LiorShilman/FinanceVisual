import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useBoardStore } from '../../app/boardStore';
import { HEALTH_COLORS, getDisplayHealthOverride } from '../../domain/health';
import { getSecondaryDetail, getWeight, isFlowCategory } from '../../domain/entity';
import { CATEGORY_ICONS } from '../icons';
import { formatCurrency } from '../format';
import type { EntityFlowNode } from '../nodeTypes';
import styles from './EntityNode.module.css';

const SECONDARY_MIN_SIZE = 108;

export function EntityNode({ data }: NodeProps<EntityFlowNode>) {
  const { entity, size, health, onOpen } = data;
  const hideAmounts = useBoardStore((s) => s.hideAmounts);
  const usdRate = useBoardStore((s) => s.usdRate);
  // dragging a connection between two handles only makes sense where edges are actually shown —
  // in the bucketed views the same drag gesture already means "reorder within this category".
  const canConnect = useBoardStore((s) => s.layoutMode === 'free');
  const color = HEALTH_COLORS[getDisplayHealthOverride(entity) ?? health];
  const secondary = size >= SECONDARY_MIN_SIZE ? getSecondaryDetail(entity) : null;
  const isFlow = isFlowCategory(entity);
  // every amount here is stored in ₪ — display converts to this entity's own currency, not a
  // global preference, so a $-entered account always reads in $ regardless of what else is on the board.
  const money = (amount: number) => formatCurrency(amount, entity.currency, usdRate);
  const weight = getWeight(entity);
  // hiding amounts means hiding them — no masked placeholder either, just nothing where the
  // number would be, same as a genuinely zero amount.
  const showAmount = weight !== 0 && !hideAmounts;
  const showSecondaryAmount = secondary?.amount !== undefined && !hideAmounts;

  return (
    <div
      className={`${styles.node} ${isFlow ? styles.flowShape : ''}`}
      style={{ width: size, height: size, ['--node-color' as string]: color }}
      onClick={() => onOpen(entity.id)}
      title={showAmount ? `${entity.name} · ${money(weight)}` : entity.name}
    >
      <Handle id="tgt" type="target" position={Position.Top} className={styles.handle} isConnectable={canConnect} />
      <span className={styles.icon}>{CATEGORY_ICONS[entity.details.kind]}</span>
      <span className={styles.name}>{entity.name}</span>
      {showAmount && <span className={styles.amount}>{money(weight)}</span>}
      {secondary && (secondary.text || showSecondaryAmount) && (
        <span className={styles.secondary}>
          {secondary.text ?? `${secondary.label}: ${money(secondary.amount ?? 0)}`}
        </span>
      )}
      <Handle id="src" type="source" position={Position.Bottom} className={styles.handle} isConnectable={canConnect} />
    </div>
  );
}
