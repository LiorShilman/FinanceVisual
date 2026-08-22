import type { FinancialEntity } from '../domain/entity';
import { useBoardStore } from './boardStore';

/**
 * Pluggable source of financial entities. Today only manual entry exists; a future adapter
 * (e.g. RiseUp's /api/external/transactions + /api/external/budget) implements the same
 * shape and maps external data into FinancialEntity without touching the rest of the app.
 */
export interface DataSource {
  id: string;
  label: string;
  fetchEntities(): Promise<FinancialEntity[]>;
}

export const manualSource: DataSource = {
  id: 'manual',
  label: 'הזנה ידנית',
  async fetchEntities() {
    return useBoardStore.getState().entities;
  },
};
