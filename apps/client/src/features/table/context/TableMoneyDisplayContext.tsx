import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { formatCents } from "@/lib/format";
import {
  createTableMoneyFormatter,
  isTournamentTableSnapshot,
  resolveTournamentBigBlindChips,
  type TableAmountDisplayMode,
  type TableMoneyFormatter,
} from "@/lib/money/table-money";
import { chips } from "@/lib/money/types";
import {
  createWagerInputHelpers,
  resolveWagerInputMode,
  USD_WAGER_INPUT_HELPERS,
  type WagerInputHelpers,
} from "@/lib/money/wager-input";
import { useTournamentDisplayStore } from "@/features/table/stores/tournament-display.store";

export type TableMoneyDisplayValue = {
  isTournamentTable: boolean;
  mode: TableAmountDisplayMode;
  setMode: (mode: TableAmountDisplayMode) => void;
  formatter: TableMoneyFormatter | null;
  formatStack: (amount: number) => string;
  formatPot: (amount: number) => string;
  formatBet: (amount: number) => string;
  formatBlinds: (smallBlind: number, bigBlind: number) => string;
  formatAnte: (amount: number) => string;
  wagerInput: WagerInputHelpers;
};

const TableMoneyDisplayContext = createContext<TableMoneyDisplayValue | null>(null);

export function TableMoneyDisplayProvider({
  snapshot,
  children,
}: {
  snapshot: TableSnapshotPayload | null;
  children: ReactNode;
}) {
  const mode = useTournamentDisplayStore((s) => s.tableAmountMode);
  const setMode = useTournamentDisplayStore((s) => s.setTableAmountMode);
  const isTournamentTable = isTournamentTableSnapshot(snapshot);

  const bigBlindChips = useMemo(
    () => (snapshot ? resolveTournamentBigBlindChips(snapshot) : chips(100)),
    [snapshot],
  );

  const formatter = useMemo(() => {
    if (!isTournamentTable || !snapshot) return null;
    return createTableMoneyFormatter({
      mode,
      bigBlind: bigBlindChips,
      smallBlind: chips(snapshot.table?.tournament?.smallBlindCents ?? snapshot.table?.smallBlindCents ?? 0),
    });
  }, [bigBlindChips, isTournamentTable, mode, snapshot]);

  const wagerInput = useMemo(() => {
    const inputMode = resolveWagerInputMode(isTournamentTable, mode);
    return inputMode === "usd" ? USD_WAGER_INPUT_HELPERS : createWagerInputHelpers(inputMode, bigBlindChips);
  }, [bigBlindChips, isTournamentTable, mode]);

  const formatStack = useCallback(
    (amount: number) => (formatter ? formatter.formatStack(chips(amount)) : formatCents(amount)),
    [formatter],
  );
  const formatPot = useCallback(
    (amount: number) => (formatter ? formatter.formatPot(chips(amount)) : formatCents(amount)),
    [formatter],
  );
  const formatBet = useCallback(
    (amount: number) => (formatter ? formatter.formatBet(chips(amount)) : formatCents(amount)),
    [formatter],
  );
  const formatBlinds = useCallback(
    (smallBlind: number, bigBlind: number) =>
      formatter ? formatter.formatBlinds(chips(smallBlind), chips(bigBlind)) : `${formatCents(smallBlind)} / ${formatCents(bigBlind)}`,
    [formatter],
  );
  const formatAnte = useCallback(
    (amount: number) => (formatter ? formatter.formatAnte(chips(amount)) : formatCents(amount)),
    [formatter],
  );

  const value = useMemo(
    () => ({
      isTournamentTable,
      mode,
      setMode,
      formatter,
      formatStack,
      formatPot,
      formatBet,
      formatBlinds,
      formatAnte,
      wagerInput,
    }),
    [formatAnte, formatBet, formatBlinds, formatPot, formatStack, formatter, isTournamentTable, mode, setMode, wagerInput],
  );

  return <TableMoneyDisplayContext.Provider value={value}>{children}</TableMoneyDisplayContext.Provider>;
}

export function useTableMoneyDisplay(): TableMoneyDisplayValue {
  const ctx = useContext(TableMoneyDisplayContext);
  if (!ctx) {
    return {
      isTournamentTable: false,
      mode: "chips",
      setMode: () => {},
      formatter: null,
      formatStack: formatCents,
      formatPot: formatCents,
      formatBet: formatCents,
      formatBlinds: (sb, bb) => `${formatCents(sb)} / ${formatCents(bb)}`,
      formatAnte: formatCents,
      wagerInput: USD_WAGER_INPUT_HELPERS,
    };
  }
  return ctx;
}
