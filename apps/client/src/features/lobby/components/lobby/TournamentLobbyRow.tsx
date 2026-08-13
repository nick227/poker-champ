import { Pressable, View } from "react-native";
import { Button } from "@/components/base/Button";
import { Text } from "@/components/base/Text";
import {
  canCreatorDeleteTournament,
  resolveTournamentCta,
} from "@/lib/tournament.utils";
import type { TournamentSummary } from "@/services/tournaments.types";
import { formatLobbyCount, formatLobbyUsd } from "../../lobbyFormat";
import {
  formatLateRegOpenLabel,
  formatLobbyStartsLine,
  formatLobbyTournamentStatus,
  lobbyTournamentStatusClass,
} from "../../tournamentLobbyRow";

export const TOURNEY_COL_FLEX = {
  event: 2,
  entry: 0.7,
  field: 1.05,
  starts: 1.35,
  lateReg: 1.1,
  status: 0.95,
  action: 1.2,
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
    <View className="h-4 w-4 rounded-full border border-brand/50 ui-center">
      <Text variant="caption" className="text-[9px] text-brand font-bold">
        R
      </Text>
    </View>
  );
}

function EnrolledMeter({ registered, max }: { registered: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (registered / max) * 100) : 0;
  return (
    <View className="w-full gap-0.5">
      <Text variant="body" className="font-mono text-[12px] tabular-nums" numberOfLines={1}>
        {formatLobbyCount(registered, max)}
      </Text>
      <View className="h-1 rounded-full bg-border overflow-hidden">
        <View className="h-1 rounded-full bg-accent-purple" style={{ width: `${pct}%` }} />
      </View>
    </View>
  );
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
  const starts = formatLobbyStartsLine(tournament, nowMs);
  const startsClass =
    starts.tone === "warn" ? "text-warn" : starts.tone === "brand" ? "text-brand" : "text-muted";
  const rowClass = `ui-row items-center px-3 gap-2 ${isLast ? "" : "border-b border-border/40"} ${
    pinned ? "bg-brand-soft border-brand/25" : ""
  }`;

  if (compact) {
    return (
      <View className={`${rowClass} py-2`}>
        <Pressable
          onPress={() => onOpenDetail(tournament)}
          className="flex-1 min-w-0"
          style={{ backgroundColor: "transparent" }}
        >
          <View className="ui-row items-center gap-1.5">
            <Text variant="body" className="font-semibold text-[13px] flex-1" numberOfLines={1}>
              {tournament.name}
            </Text>
            {tournament.playFormat === "REBUY" ? <RebuyMark /> : null}
          </View>
          <Text variant="muted" className="text-[11px] mt-0.5" numberOfLines={1}>
            {formatLobbyUsd(tournament.entryFeeCents)} ·{" "}
            {formatLobbyCount(tournament.registeredCount, tournament.maxPlayers)} · {starts.text}
          </Text>
        </Pressable>
        <Button
          title={actionInFlight ? "…" : cta.label}
          intent={cta.action === "unregister" ? "neutral" : "accent"}
          size="sm"
          shape="hud"
          minWidth={0}
          disabled={disabled}
          onPress={() => onAction(tournament)}
          className="min-h-[32px] px-2"
        />
      </View>
    );
  }

  return (
    <View className={`${rowClass} h-[56px] overflow-hidden`}>
      <Pressable
        onPress={() => onOpenDetail(tournament)}
        className="flex-col items-start justify-center min-w-0 rounded-none"
        style={{ flex: TOURNEY_COL_FLEX.event, backgroundColor: "transparent", borderRadius: 0 }}
      >
        <View className="ui-row items-center gap-1.5 w-full">
          <Text variant="body" className="font-semibold text-[13px] flex-1" numberOfLines={1}>
            {tournament.name}
          </Text>
          {tournament.playFormat === "REBUY" ? <RebuyMark /> : null}
        </View>
      </Pressable>
      <Text
        variant="body"
        className="font-mono text-[12px] tabular-nums"
        numberOfLines={1}
        style={{ flex: TOURNEY_COL_FLEX.entry }}
      >
        {formatLobbyUsd(tournament.entryFeeCents)}
      </Text>
      <View style={{ flex: TOURNEY_COL_FLEX.field }} className="pr-2">
        <EnrolledMeter registered={tournament.registeredCount} max={tournament.maxPlayers} />
      </View>
      <Text
        variant="body"
        className={`text-[12px] ${startsClass}`}
        numberOfLines={1}
        style={{ flex: TOURNEY_COL_FLEX.starts }}
      >
        {starts.text}
      </Text>
      <Text
        variant="body"
        className="text-[12px]"
        numberOfLines={1}
        style={{ flex: TOURNEY_COL_FLEX.lateReg }}
      >
        {formatLateRegOpenLabel(tournament, nowMs)}
      </Text>
      <Text
        variant="body"
        className={`text-[12px] ${lobbyTournamentStatusClass(tournament, nowMs, pinned)}`}
        numberOfLines={1}
        style={{ flex: TOURNEY_COL_FLEX.status }}
      >
        {pinned ? "Joined" : formatLobbyTournamentStatus(tournament, nowMs)}
      </Text>
      <View className="items-stretch gap-1 min-w-0" style={{ flex: TOURNEY_COL_FLEX.action }}>
        <Button
          title={actionInFlight ? "…" : cta.label}
          intent={cta.action === "unregister" || cta.action === "none" ? "neutral" : "accent"}
          size="sm"
          shape="hud"
          minWidth={0}
          disabled={disabled}
          onPress={() => onAction(tournament)}
          className="min-h-[32px] px-2 w-full"
        />
        {showDelete ? (
          <Pressable
            onPress={() => onDelete?.(tournament)}
            disabled={deleteInFlightId === tournament.id || actionInFlight}
            className="btn px-1 rounded-none"
            style={{ backgroundColor: "transparent" }}
          >
            <Text variant="muted" className="text-[10px] text-danger" numberOfLines={1}>
              {deleteInFlightId === tournament.id ? "…" : "Delete"}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
