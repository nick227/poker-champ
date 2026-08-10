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
  nowMs: number;
  authenticated: boolean;
  actionInFlight?: boolean;
  onOpenDetail: (tournament: TournamentSummary) => void;
  onAction: (tournament: TournamentSummary) => void;
  onDelete?: (tournament: TournamentSummary) => void;
  deleteInFlightId?: string | null;
};

/** Dense tournament rows — same HUD language as cash LobbyTableList. */
export function TournamentLobbyList({
  tournaments,
  nowMs,
  authenticated,
  actionInFlight,
  onOpenDetail,
  onAction,
  onDelete,
  deleteInFlightId,
}: Props) {
  return (
    <View className="border border-border rounded-2 overflow-hidden bg-panel">
      <View className="ui-row items-center border-b border-border bg-panel-elevated px-3 h-9">
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
      {tournaments.map((tournament) => {
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
            key={tournament.id}
            className="ui-row items-center border-b border-border/40 px-3 min-h-[52px] py-2 gap-2"
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
              variant="muted"
              className="text-[12px] w-[88px] text-right text-gold"
              numberOfLines={1}
            >
              {formatTournamentStatus(tournament.status)}
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
      })}
    </View>
  );
}
