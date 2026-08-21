import { View } from "react-native";
import { Text } from "@/components/base/Text";
import type { LobbyTableRow } from "@/lib/lobbyTables";
import {
  cashLobbyCtaLabel,
  resolveCashLobbyCta,
  resolveCashLobbyStatus,
  type CashLobbyCta,
} from "../../cashLobbyRow";
import { formatLobbyCount, formatLobbyUsd } from "../../lobbyFormat";
import { LobbyRowCta, type LobbyRowCtaKind } from "./LobbyRowCta";

export const CASH_COL_FLEX = {
  name: 2.2,
  blinds: 1.2,
  players: 0.9,
  action: 0.9,
} as const;

export function formatCashBlinds(table: LobbyTableRow): string {
  if (table.smallBlindCents <= 0 && table.bigBlindCents <= 0) return "—";
  return `${formatLobbyUsd(table.smallBlindCents)} / ${formatLobbyUsd(table.bigBlindCents)}`;
}



function cashCtaKind(cta: CashLobbyCta): LobbyRowCtaKind {
  if (cta === "join") return "join";
  if (cta === "resume") return "resume";
  return "watch";
}

type RowProps = {
  table: LobbyTableRow;
  pinned: boolean;
  joining: boolean;
  isLast?: boolean;
  onJoin: (table: LobbyTableRow) => void;
  onResume?: (table: LobbyTableRow) => void;
  onWatch?: (table: LobbyTableRow) => void;
};

function handleCashCta(
  cta: CashLobbyCta,
  table: LobbyTableRow,
  onJoin: (table: LobbyTableRow) => void,
  onResume?: (table: LobbyTableRow) => void,
  onWatch?: (table: LobbyTableRow) => void,
) {
  if (cta === "resume") {
    onResume?.(table);
    return;
  }
  if (cta === "join") {
    onJoin(table);
    return;
  }
  onWatch?.(table);
}

export function LobbyCashDesktopRow({
  table,
  pinned,
  joining,
  isLast = false,
  onJoin,
  onResume,
  onWatch,
}: RowProps) {
  const status = resolveCashLobbyStatus(table, pinned);
  const cta = resolveCashLobbyCta(status);

  return (
    <View
      className={`ui-row items-center px-4 min-h-[56px] ${isLast ? "" : "border-b border-border/50"} ${
        pinned ? "bg-brand-soft/55" : "hover:bg-panel-elevated/60"
      }`}
      style={{ opacity: joining ? 0.7 : 1 }}
    >
      <Text
        variant="body"
        className="font-semibold text-[13px] pr-2"
        numberOfLines={1}
        style={{ flex: CASH_COL_FLEX.name }}
      >
        {joining ? "Joining…" : table.name}
      </Text>
      <Text
        variant="body"
        className="font-mono text-[12px] tabular-nums text-muted pr-2"
        numberOfLines={1}
        style={{ flex: CASH_COL_FLEX.blinds }}
      >
        {formatCashBlinds(table)}
      </Text>
      <Text
        variant="body"
        className="font-mono text-[12px] tabular-nums pr-2"
        numberOfLines={1}
        style={{ flex: CASH_COL_FLEX.players }}
      >
        {formatLobbyCount(table.players, table.seats)}
      </Text>

      <View style={{ flex: CASH_COL_FLEX.action }} className="items-end">
        <LobbyRowCta
          title={joining ? "…" : cashLobbyCtaLabel(cta, true)}
          kind={cashCtaKind(cta)}
          disabled={joining}
          onPress={() => handleCashCta(cta, table, onJoin, onResume, onWatch)}
        />
      </View>
    </View>
  );
}
