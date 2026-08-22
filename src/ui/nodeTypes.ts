import type { Node } from '@xyflow/react';
import type { FinancialEntity } from '../domain/entity';
import type { HealthStatus } from '../domain/health';

export interface EntityNodeData extends Record<string, unknown> {
  entity: FinancialEntity;
  size: number;
  health: HealthStatus;
  onOpen: (id: string) => void;
}
export type EntityFlowNode = Node<EntityNodeData, 'entity'>;

export interface GhostNodeData extends Record<string, unknown> {
  label: string;
  icon: string;
  onCreate: () => void;
}
export type GhostFlowNode = Node<GhostNodeData, 'ghost'>;
