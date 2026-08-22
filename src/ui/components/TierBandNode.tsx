import type { Node, NodeProps } from '@xyflow/react';
import styles from './TierBandNode.module.css';

export interface TierBandNodeData extends Record<string, unknown> {
  color: string;
  fillRatio: number;
  width: number;
  height: number;
}
export type TierBandFlowNode = Node<TierBandNodeData, 'tierBand'>;

export function TierBandNode({ data }: NodeProps<TierBandFlowNode>) {
  const pct = Math.round(Math.min(1, data.fillRatio) * 20 + 6);
  // a whole-stack "wobble" doesn't translate to side-by-side columns — instead, the specific
  // tier that's underfunded pulses to draw the eye, which is arguably more useful: it points
  // at exactly which zone needs attention instead of just signaling "something's off" globally.
  const isWeak = data.fillRatio < 0.6;
  return (
    <div
      className={`${styles.band} ${isWeak ? styles.pulse : ''}`}
      style={{
        width: data.width,
        height: data.height,
        ['--band-color' as string]: data.color,
        ['--fill-pct' as string]: `${pct}%`,
      }}
    />
  );
}
