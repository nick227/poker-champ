import { create } from "zustand";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";

type TableStoreState = {
  snapshotsByTableId: Record<string, TableSnapshotPayload | undefined>;
  statusByTableId: Record<string, string | undefined>;
  errorByTableId: Record<string, string | undefined>;
  setSnapshot: (tableId: string, snapshot: TableSnapshotPayload) => void;
  setStatus: (tableId: string, status: string) => void;
  setError: (tableId: string, error: string) => void;
  clearTable: (tableId: string) => void;
};

export const useTableStore = create<TableStoreState>((set) => ({
  snapshotsByTableId: {},
  statusByTableId: {},
  errorByTableId: {},
  setSnapshot: (tableId, snapshot) =>
    set((s) => ({
      snapshotsByTableId: {
        ...s.snapshotsByTableId,
        [tableId]: snapshot,
      },
      errorByTableId: {
        ...s.errorByTableId,
        [tableId]: undefined,
      },
    })),
  setStatus: (tableId, status) =>
    set((s) => ({
      statusByTableId: {
        ...s.statusByTableId,
        [tableId]: status,
      },
    })),
  setError: (tableId, error) =>
    set((s) => ({
      errorByTableId: {
        ...s.errorByTableId,
        [tableId]: error,
      },
    })),
  clearTable: (tableId) =>
    set((s) => {
      const { [tableId]: _snapshot, ...snapshotsByTableId } = s.snapshotsByTableId;
      const { [tableId]: _status, ...statusByTableId } = s.statusByTableId;
      const { [tableId]: _error, ...errorByTableId } = s.errorByTableId;
      return { snapshotsByTableId, statusByTableId, errorByTableId };
    }),
}));

