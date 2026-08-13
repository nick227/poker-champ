import { View } from "react-native";
import { Button } from "@/components/base/Button";
import { Text } from "@/components/base/Text";
import { formatCents } from "@/lib/format";
import type { LobbyTableRow } from "@/lib/lobbyTables";
import {
  cashLobbyCtaLabel,
  cashLobbyStatusLabel,
  resolveCashLobbyCta,
  resolveCashLobbyStatus,
  type CashLobbyCta,
} from "../../cashLobbyRow";
import { SeatOccupancy } from "./SeatOccupancy";

export const CASH_COL_FLEX = {
  name: 2.2,
  blinds: 1,
  players: 1.3,
  avgPot: 0.9,
  status: 1.2,
  action: 1.3,
} as const;

export function formatCashBlinds(table: LobbyTableRow): string {
  if (table.smallBlindCents <= 0 && table.bigBlindCents <= 0) return "—";
  return `${formatCents(table.smallBlindCents)}/${formatCents(table.bigBlindCents)}`;
}

export function formatCashAvgPot(table: LobbyTableRow): string {
  if (table.avgPotCents == null || table.avgPotCents <= 0) return "—";
  return formatCents(table.avgPotCents);
}

export function cashStatusClass(status: ReturnType<typeof resolveCashLobbyStatus>): string {
  if (status === "joined" || status === "open") return "text-brand";
  if (status === "waitlist") return "text-warn";
  return "text-danger";
}

export function cashStatusDotClass(status: ReturnType<typeof resolveCashLobbyStatus>): string {
  if (status === "joined" || status === "open") return "bg-brand";
  if (status === "waitlist") return "bg-warn";
  return "bg-danger";
}

type RowProps = {
  table: LobbyTableRow;
  pinned: boolean;
  joining: boolean;
  onJoin: (table: LobbyTableRow) => void;
  onResume?: (table: LobbyTableRow) => void;
};

function handleCashCta(
  cta: CashLobbyCta,
  table: LobbyTableRow,
  onJoin: (table: LobbyTableRow) => void,
  onResume?: (table: LobbyTableRow) => void,
) {
  if (cta === "resume") {
    onResume?.(table);
    return;
  }
  if (cta === "join") onJoin(table);
}

export function LobbyCashDesktopRow({ table, pinned, joining, onJoin, onResume }: RowProps) {
  const status = resolveCashLobbyStatus(table, pinned);
  const cta = resolveCashLobbyCta(status);
  const ctaEnabled = cta !== "view" && !joining;

  return (
    <View
      className={`ui-row items-center border-b border-border/40 px-3 h-12 ${
        pinned ? "bg-brand-soft border-brand/25" : ""
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
        className="font-mono text-[12px] tabular-nums text-right pr-2"
        numberOfLines={1}
        style={{ flex: CASH_COL_FLEX.blinds }}
      >
        {formatCashBlinds(table)}
      </Text>
      <View style={{ flex: CASH_COL_FLEX.players }} className="items-end pr-2 gap-0.5">
        <Text variant="body" className="font-mono text-[12px] tabular-nums" numberOfLines={1}>
          {table.seats > 0 ? `${table.players}/${table.seats}` : "—"}
        </Text>
        <SeatOccupancy players={table.players} seats={table.seats} />
      </View>
      <Text
        variant="body"
        className="font-mono text-[12px] tabular-nums text-right pr-2"
        numberOfLines={1}
        style={{ flex: CASH_COL_FLEX.avgPot }}
      >
        {formatCashAvgPot(table)}
      </Text>
      <View style={{ flex: CASH_COL_FLEX.status }} className="items-end pr-2">
        <View className="ui-row items-center gap-1.5">
          <View className={`h-1.5 w-1.5 rounded-full ${cashStatusDotClass(status)}`} />
          <Text
            variant="body"
            className={`text-[12px] font-semibold ${cashStatusClass(status)}`}
            numberOfLines={1}
          >
            {cashLobbyStatusLabel(status, table.waitlistCount)}
          </Text>
        </View>
      </View>
      <View style={{ flex: CASH_COL_FLEX.action }} className="items-end">
        <Button
          title={joining ? "…" : cashLobbyCtaLabel(cta, false)}
          onPress={() => handleCashCta(cta, table, onJoin, onResume)}
          disabled={!ctaEnabled}
          intent={cta === "join" ? "ghost" : "neutral"}
          size="sm"
          shape="hud"
          minWidth={0}
          className={
            cta === "join"
              ? "h-8 min-h-[32px] px-2 border border-brand bg-transparent"
              : "h-8 min-h-[32px] px-2"
          }
          textClassName={cta === "join" ? "text-brand" : ""}
        />
      </View>
    </View>
  );
}
