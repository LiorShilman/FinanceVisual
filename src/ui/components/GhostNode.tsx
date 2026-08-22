import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { GhostFlowNode } from '../nodeTypes';
import styles from './EntityNode.module.css';
import { MIN_NODE_SIZE } from '../../domain/sizing';

export function GhostNode({ data }: NodeProps<GhostFlowNode>) {
  return (
    <div
      className={`${styles.node} ${styles.ghost}`}
      style={{ width: MIN_NODE_SIZE + 30, height: MIN_NODE_SIZE + 30 }}
      onClick={data.onCreate}
      title={`הוסף ${data.label}`}
    >
      <Handle id="tgt" type="target" position={Position.Top} className={styles.handle} isConnectable={false} />
      <span className={styles.ghostIcon}>{data.icon}</span>
      <span className={styles.ghostLabel}>{data.label}</span>
      <span className={styles.ghostHint}>חסר · לחץ להוספה</span>
      <Handle id="src" type="source" position={Position.Bottom} className={styles.handle} isConnectable={false} />
    </div>
  );
}
