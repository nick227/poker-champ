import { Pressable, View } from "react-native";
import { Button } from "@/components/base/Button";
import { Text } from "@/components/base/Text";
import { formatCents } from "@/lib/format";
import { formatTournamentSupplementHint, isLobbyTimerVisible } from "@/lib/tournamentLobbyTimer";
import {
  canCreatorDeleteTournament,
  formatTournamentBrowseHint,
  formatTournamentStatus,
  resolveTournamentCta,
} from "@/lib/tournament.utils";
import type { TournamentSummary } from "@/services/tournaments.types";
import { TournamentLobbyTimer } from "./TournamentLobbyTimer";

type Props = {
  tournaments: TournamentSummary[];
  /** Frozen joined rows rendered above browse rows (status Joined). */
  pinnedTournaments?: TournamentSummary[];
  nowMs: number;
  authenticated: boolean;
  actionInFlight?: boolean;
  onOpenDetail: (tournament: TournamentSummary) => void;
  onAction: (tournament: TournamentSummary) => void;
  onDelete?: (tournament: TournamentSummary) => void;
  deleteInFlightId?: string | null;
};

function TournamentRow({
  tournament,
  pinned,
  nowMs,
  authenticated,
  actionInFlight,
  onOpenDetail,
  onAction,
  onDelete,
  deleteInFlightId,
}: {
  tournament: TournamentSummary;
  pinned: boolean;
  nowMs: number;
  authenticated: boolean;
  actionInFlight?: boolean;
  onOpenDetail: (tournament: TournamentSummary) => void;
  onAction: (tournament: TournamentSummary) => void;
  onDelete?: (tournament: TournamentSummary) => void;
  deleteInFlightId?: string | null;
}) {
  const cta = resolveTournamentCta(tournament, { authenticated, nowMs });
  const disabled = cta.disabled || actionInFlight;
  const showDelete = onDelete != null && canCreatorDeleteTournament(tournament);
  const showTimer = isLobbyTimerVisible(tournament, nowMs);
  const hint =
    (showTimer
      ? formatTournamentSupplementHint(tournament, nowMs)
      : formatTournamentBrowseHint(tournament, nowMs)) ?? null;

  return (
    <View
      className={`ui-row items-center border-b border-border/40 px-3 min-h-[52px] py-2 gap-2 ${
        pinned ? "bg-brand-soft border-brand/25" : ""
      }`}
    >
      <Pressable
        onPress={() => onOpenDetail(tournament)}
        className="btn flex-1 min-w-0 rounded-none"
        style={{ backgroundColor: "transparent", borderRadius: 0 }}
      >
        <Text variant="body" className="font-semibold text-[13px]" numberOfLines={1}>
          {tournament.name}
        </Text>
        {hint ? (
          <Text variant="muted" className="text-[11px]" numberOfLines={1}>
            {hint}
          </Text>
        ) : null}
        {showTimer ? <TournamentLobbyTimer tournament={tournament} nowMs={nowMs} /> : null}
      </Pressable>
      <Text variant="body" className="font-mono text-[12px] tabular-nums w-[88px] text-right">
        {formatCents(tournament.entryFeeCents)}
      </Text>
      <Text variant="body" className="font-mono text-[12px] tabular-nums w-[72px] text-right">
        {tournament.registeredCount}/{tournament.maxPlayers}
      </Text>
      <Text
        variant="body"
        className={`text-[12px] w-[88px] text-right ${
          pinned ? "text-brand font-semibold" : "text-gold"
        }`}
        numberOfLines={1}
      >
        {pinned ? "Joined" : formatTournamentStatus(tournament.status)}
      </Text>
      <View className="w-[100px] items-end gap-1">
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
        {showDelete ? (
          <Pressable
            onPress={() => onDelete?.(tournament)}
            disabled={deleteInFlightId === tournament.id || actionInFlight}
            className="btn px-1 rounded-none"
            style={{ backgroundColor: "transparent" }}
          >
            <Text variant="muted" className="text-[10px] text-danger">
              {deleteInFlightId === tournament.id ? "…" : "Delete"}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** Dense tournament rows — same HUD language as cash LobbyTableList. */
export function TournamentLobbyList({
  tournaments,
  pinnedTournaments = [],
  nowMs,
  authenticated,
  actionInFlight,
  onOpenDetail,
  onAction,
  onDelete,
  deleteInFlightId,
}: Props) {
  return (
    <View className="lobby-stage border rounded-2 overflow-hidden">
      <View className="ui-row items-center border-b border-border/50 bg-panel-elevated/90 px-3 h-9">
        <Text variant="muted" className="text-[11px] tracking-wide uppercase font-semibold flex-1">
          Event
        </Text>
        <Text variant="muted" className="text-[11px] tracking-wide uppercase font-semibold w-[88px] text-right">
          Entry
        </Text>
        <Text variant="muted" className="text-[11px] tracking-wide uppercase font-semibold w-[72px] text-right">
          Field
        </Text>
        <Text variant="muted" className="text-[11px] tracking-wide uppercase font-semibold w-[88px] text-right">
          Status
        </Text>
        <View className="w-[100px]" />
      </View>
      {pinnedTournaments.map((tournament) => (
        <TournamentRow
          key={`pin-${tournament.id}`}
          tournament={tournament}
          pinned
          nowMs={nowMs}
          authenticated={authenticated}
          actionInFlight={actionInFlight}
          onOpenDetail={onOpenDetail}
          onAction={onAction}
          onDelete={onDelete}
          deleteInFlightId={deleteInFlightId}
        />
      ))}
      {tournaments.map((tournament) => (
        <TournamentRow
          key={tournament.id}
          tournament={tournament}
          pinned={false}
          nowMs={nowMs}
          authenticated={authenticated}
          actionInFlight={actionInFlight}
          onOpenDetail={onOpenDetail}
          onAction={onAction}
          onDelete={onDelete}
          deleteInFlightId={deleteInFlightId}
        />
      ))}
    </View>
  );
}
