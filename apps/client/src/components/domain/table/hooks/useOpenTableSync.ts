import { useEffect } from "react";

type OpenTableOptions = {
  buyInCents: number;
};

type UseOpenTableSyncOptions = {
  tableId: string;
  routeBuyInCents?: number;
  joinStateBuyInCents?: number | null;
  openTableIds: string[];
  activeTableId?: string | null;
  openTable: (tableId: string, options?: OpenTableOptions) => void;
  setActive: (tableId: string) => void;
  lobbyTableCount: number;
  refreshLobby: () => void;
};

export function useOpenTableSync({
  tableId,
  routeBuyInCents,
  joinStateBuyInCents,
  openTableIds,
  activeTableId,
  openTable,
  setActive,
  lobbyTableCount,
  refreshLobby,
}: UseOpenTableSyncOptions) {
  useEffect(() => {
    if (tableId && lobbyTableCount === 0) {
      refreshLobby();
    }
  }, [tableId, lobbyTableCount, refreshLobby]);

  useEffect(() => {
    if (!tableId) return;
    const hasOpenTable = openTableIds.includes(tableId);
    const shouldPersistRouteBuyIn =
      Number.isInteger(routeBuyInCents) &&
      Number(routeBuyInCents) > 0 &&
      routeBuyInCents !== joinStateBuyInCents;

    if (!hasOpenTable) {
      openTable(tableId, shouldPersistRouteBuyIn ? { buyInCents: routeBuyInCents as number } : undefined);
    } else if (shouldPersistRouteBuyIn) {
      openTable(tableId, { buyInCents: routeBuyInCents as number });
    }

    if (activeTableId !== tableId) setActive(tableId);
  }, [tableId, routeBuyInCents, joinStateBuyInCents, openTableIds, activeTableId, openTable, setActive]);
}
