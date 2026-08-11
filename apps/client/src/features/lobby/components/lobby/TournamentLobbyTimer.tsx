import { Text } from "@/components/base/Text";
import { resolveTournamentLobbyTimer } from "@/lib/tournamentLobbyTimer";
import type { TournamentSummary } from "@/services/tournaments.types";

type TournamentLobbyTimerProps = {
  tournament: TournamentSummary;
  nowMs: number;
  /** Extra context appended after the clock (e.g. browse hint) — kept on the same line. */
  hint?: string | null;
};

/** Dense, single-line clock for HUD-style lobby rows — never wraps. */
export function TournamentLobbyTimer({ tournament, nowMs, hint }: TournamentLobbyTimerProps) {
  const timer = resolveTournamentLobbyTimer(tournament, nowMs);
  if (!timer) return null;

  return (
    <Text variant="muted" className="text-[11px]" numberOfLines={1}>
      <Text variant="label" className="text-muted uppercase tracking-wide text-[11px]">
        {timer.headline}{" "}
      </Text>
      <Text variant="body" className="text-brand font-semibold tabular-nums text-[11px]">
        {timer.time}
      </Text>
      {timer.detail ? ` · ${timer.detail}` : ""}
      {hint ? ` · ${hint}` : ""}
    </Text>
  );
}
