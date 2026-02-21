import { useMemo } from "react";
import { normalizeTable } from "@/lib/lobbyTables";

export type ResolvedBuyInParams = {
  tableId: string;
  buyInCentsParam: string | string[] | undefined;
  joinStateBuyInCents: number | undefined;
  persistedBuyInCents: number | undefined;
  lobbyTables: unknown[];
};

function parseRouteBuyIn(buyInCentsParam: string | string[] | undefined): number | undefined {
  const raw = Array.isArray(buyInCentsParam) ? buyInCentsParam[0] : buyInCentsParam;
  let parsed = Number(raw);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const urlBuyIn = params.get("buyInCents");
    parsed = Number(urlBuyIn ?? "");
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}

export function useResolvedBuyIn(params: ResolvedBuyInParams): {
  buyInCents: number | undefined;
  routeBuyInCents: number | undefined;
} {
  const { tableId, buyInCentsParam, joinStateBuyInCents, persistedBuyInCents, lobbyTables } = params;

  const routeBuyInCents = useMemo(
    () => parseRouteBuyIn(buyInCentsParam),
    [buyInCentsParam]
  );

  const buyInCents = useMemo(() => {
    if (routeBuyInCents != null) return routeBuyInCents;
    if (Number.isInteger(joinStateBuyInCents) && Number(joinStateBuyInCents) > 0) return Number(joinStateBuyInCents);
    if (Number.isInteger(persistedBuyInCents) && Number(persistedBuyInCents) > 0) return Number(persistedBuyInCents);
    const table = lobbyTables
      .map((t) => normalizeTable(t as Record<string, unknown>))
      .find((t) => t.id === tableId);
    const min = table?.minBuyInCents;
    return min != null && min > 0 ? min : undefined;
  }, [routeBuyInCents, joinStateBuyInCents, persistedBuyInCents, lobbyTables, tableId]);

  return { buyInCents, routeBuyInCents };
}
