import type { Node, NodeProps } from '@xyflow/react';
import styles from './LabelNode.module.css';

export interface LabelNodeData extends Record<string, unknown> {
  text: string;
}
export type LabelFlowNode = Node<LabelNodeData, 'label'>;

export function LabelNode({ data }: NodeProps<LabelFlowNode>) {
  return <div className={styles.label}>{data.text}</div>;
}
