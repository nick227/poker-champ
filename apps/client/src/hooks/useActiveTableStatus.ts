import { usePathname } from "expo-router";
import { TABLE } from "@/constants/copy";
import { formatTableStakesLine } from "@/features/table/lib/formatTableStakesLine";
import { useTableStore } from "@/features/table/stores/table.store";

export type ActiveTableStatus = {
  tableName: string;
  stakesLine: string | null;
};

function tableIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/table\/([^/?#]+)/);
  return match?.[1] ?? null;
}

/** Table identity for the workspace status bar when on `/table/:id`. */
export function useActiveTableStatus(): ActiveTableStatus | null {
  const pathname = usePathname() ?? "/";
  const tableId = tableIdFromPath(pathname);
  const snapshot = useTableStore((s) => (tableId ? s.snapshotsByTableId[tableId] : undefined));

  if (!tableId || !snapshot?.table) return null;

  const table = snapshot.table;
  return {
    tableName: table.tableName?.trim() || TABLE.defaultTableName,
    stakesLine: formatTableStakesLine(table.smallBlindCents, table.bigBlindCents, table.minBuyInCents),
  };
}
