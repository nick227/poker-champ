import { Pressable, View } from "react-native";
import { Text } from "@/components/base/Text";
import {
  canCreatorDeleteTournament,
  resolveTournamentCta,
} from "@/lib/tournament.utils";
import type { TournamentCta, TournamentSummary } from "@/services/tournaments.types";
import { formatLobbyCount, formatLobbyUsd } from "../../lobbyFormat";
import {
  compactTournamentCtaLabel,
  formatLateRegOpenLabel,
  formatLobbyStartsLine,
  formatLobbyTournamentStatus,
  lobbyTournamentStatusClass,
} from "../../tournamentLobbyRow";
import { LobbyRowCta, type LobbyRowCtaKind } from "./LobbyRowCta";

export const TOURNEY_COL_FLEX = {
  event: 2,
  entry: 0.7,
  field: 1.05,
  starts: 1.35,
  lateReg: 1.05,
  status: 0.95,
  action: 1.15,
} as const;

type Props = {
  tournament: TournamentSummary;
  pinned: boolean;
  nowMs: number;
  authenticated: boolean;
  actionInFlight?: boolean;
  compact?: boolean;
  isLast?: boolean;
  onOpenDetail: (tournament: TournamentSummary) => void;
  onAction: (tournament: TournamentSummary) => void;
  onDelete?: (tournament: TournamentSummary) => void;
  deleteInFlightId?: string | null;
};

function RebuyMark() {
  return (
    <View className="h-4 w-4 rounded-full border border-brand/40 ui-center">
      <Text variant="caption" className="text-[9px] text-brand font-semibold">
        R
      </Text>
    </View>
  );
}

function tourneyCtaKind(cta: TournamentCta): LobbyRowCtaKind {
  if (cta.action === "none") return "quiet";
  if (cta.action === "register" || cta.action === "join" || cta.action === "rebuy") return "register";
  return "watch";
}

export function TournamentLobbyRow({
  tournament,
  pinned,
  nowMs,
  authenticated,
  actionInFlight,
  compact = false,
  isLast = false,
  onOpenDetail,
  onAction,
  onDelete,
  deleteInFlightId,
}: Props) {
  const cta = resolveTournamentCta(tournament, { authenticated, nowMs });
  const disabled = cta.disabled || actionInFlight;
  const showDelete = onDelete != null && canCreatorDeleteTournament(tournament);
  const starts = formatLobbyStartsLine(tournament, nowMs, compact);
  const startsClass =
    starts.tone === "warn" ? "text-warn" : starts.tone === "brand" ? "text-brand" : "text-muted";
  const lateReg = formatLateRegOpenLabel(tournament, nowMs);
  const rowClass = `ui-row items-center px-4 ${isLast ? "" : "border-b border-border/50"} ${
    pinned ? "bg-brand-soft/55" : "hover:bg-panel-elevated/60"
  }`;

  const nameRow = (
    <View className="ui-row items-center gap-1.5 w-full">
      <Text variant="body" className="font-semibold text-[13px] flex-1" numberOfLines={1}>
        {tournament.name}
      </Text>
      {tournament.playFormat === "REBUY" ? <RebuyMark /> : null}
      {showDelete ? (
        <Pressable
          onPress={() => onDelete?.(tournament)}
          disabled={deleteInFlightId === tournament.id || actionInFlight}
          className="btn px-0 rounded-none"
          style={{ backgroundColor: "transparent" }}
        >
          <Text variant="muted" className="text-[10px] text-danger" numberOfLines={1}>
            {deleteInFlightId === tournament.id ? "…" : "Delete"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );

  if (compact) {
    return (
      <View className={`${rowClass} py-2`} style={{ minHeight: 52 }}>
        <Pressable
          onPress={() => onOpenDetail(tournament)}
          className="flex-1 min-w-0 pr-2"
          style={{ backgroundColor: "transparent" }}
        >
          {nameRow}
          <Text variant="muted" className="text-[11px] mt-0.5" numberOfLines={1}>
            {formatLobbyUsd(tournament.entryFeeCents)} ·{" "}
            {formatLobbyCount(tournament.registeredCount, tournament.maxPlayers)}
          </Text>
        </Pressable>
        <View style={{ width: 84 }} className="items-end pr-2">
          <Text variant="body" className={`text-[11px] ${startsClass}`} numberOfLines={1}>
            {starts.text}
          </Text>
          <Text
            variant="body"
            className={`text-[10px] mt-0.5 ${lobbyTournamentStatusClass(tournament, nowMs, pinned)}`}
            numberOfLines={1}
          >
            {pinned ? "Joined" : formatLobbyTournamentStatus(tournament, nowMs)}
          </Text>
        </View>
        <View style={{ width: 96 }} className="items-end">
          <LobbyRowCta
            title={actionInFlight ? "…" : compactTournamentCtaLabel(cta.label)}
            kind={tourneyCtaKind(cta)}
            disabled={disabled}
            onPress={() => onAction(tournament)}
          />
        </View>
      </View>
    );
  }

  return (
    <View className={`${rowClass} min-h-[56px]`}>
      <Pressable
        onPress={() => onOpenDetail(tournament)}
        className="flex-col items-start justify-center min-w-0 rounded-none pr-2"
        style={{ flex: TOURNEY_COL_FLEX.event, backgroundColor: "transparent", borderRadius: 0 }}
      >
        {nameRow}
      </Pressable>
      <Text
        variant="body"
        className="font-mono text-[12px] tabular-nums text-muted pr-2"
        numberOfLines={1}
        style={{ flex: TOURNEY_COL_FLEX.entry }}
      >
        {formatLobbyUsd(tournament.entryFeeCents)}
      </Text>
      <Text
        variant="body"
        className="font-mono text-[12px] tabular-nums pr-2"
        numberOfLines={1}
        style={{ flex: TOURNEY_COL_FLEX.field }}
      >
        {formatLobbyCount(tournament.registeredCount, tournament.maxPlayers)}
      </Text>
      <Text
        variant="body"
        className={`text-[12px] pr-2 ${startsClass}`}
        numberOfLines={1}
        style={{ flex: TOURNEY_COL_FLEX.starts }}
      >
        {starts.text}
      </Text>
      <Text
        variant="body"
        className={`text-[12px] pr-2 ${lateReg === "Closed" ? "text-muted" : ""}`}
        numberOfLines={1}
        style={{ flex: TOURNEY_COL_FLEX.lateReg }}
      >
        {lateReg}
      </Text>
      <Text
        variant="body"
        className={`text-[12px] pr-2 ${lobbyTournamentStatusClass(tournament, nowMs, pinned)}`}
        numberOfLines={1}
        style={{ flex: TOURNEY_COL_FLEX.status }}
      >
        {pinned ? "Joined" : formatLobbyTournamentStatus(tournament, nowMs)}
      </Text>
      <View className="items-end min-w-0" style={{ flex: TOURNEY_COL_FLEX.action }}>
        <LobbyRowCta
          title={actionInFlight ? "…" : cta.label}
          kind={tourneyCtaKind(cta)}
          disabled={disabled}
          onPress={() => onAction(tournament)}
        />
      </View>
    </View>
  );
}
