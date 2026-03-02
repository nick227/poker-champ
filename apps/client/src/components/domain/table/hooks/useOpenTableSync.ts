import { useEffect, useRef } from "react";

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
  const lastOpenAttemptForTableRef = useRef<string | null>(null);
  const lastActiveAttemptForTableRef = useRef<string | null>(null);
  const hasRefreshedLobbyWhenEmptyRef = useRef(false);
  const syncDoneForTableIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!tableId || lobbyTableCount > 0) return;
    if (hasRefreshedLobbyWhenEmptyRef.current) return;
    hasRefreshedLobbyWhenEmptyRef.current = true;
    refreshLobby();
  }, [tableId, lobbyTableCount, refreshLobby]);

  useEffect(() => {
    if (!tableId) return;
    if (syncDoneForTableIdRef.current === tableId) return;
    const hasOpenTable = openTableIds.includes(tableId);
    const shouldUseRouteBuyInOnOpen =
      Number.isInteger(routeBuyInCents) &&
      Number(routeBuyInCents) > 0 &&
      routeBuyInCents !== joinStateBuyInCents;

    if (!hasOpenTable) {
      if (lastOpenAttemptForTableRef.current !== tableId) {
        lastOpenAttemptForTableRef.current = tableId;
        openTable(tableId, shouldUseRouteBuyInOnOpen ? { buyInCents: routeBuyInCents as number } : undefined);
      }
      syncDoneForTableIdRef.current = tableId;
      return;
    }
    lastOpenAttemptForTableRef.current = null;

    if (activeTableId !== tableId && lastActiveAttemptForTableRef.current !== tableId) {
      lastActiveAttemptForTableRef.current = tableId;
      setActive(tableId);
    } else if (activeTableId === tableId) {
      lastActiveAttemptForTableRef.current = null;
    }
    syncDoneForTableIdRef.current = tableId;
  }, [tableId, routeBuyInCents, joinStateBuyInCents, openTableIds, activeTableId, openTable, setActive]);
}
