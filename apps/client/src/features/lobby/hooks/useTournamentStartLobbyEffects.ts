import { useEffect, useMemo, useRef } from "react";
import { useNowMs } from "@/hooks/useNowMs";
import { isTournamentStartDue, selectJoinedTournaments } from "@/lib/tournament.utils";
import { emitSoundEvent } from "@/sound/emitSoundEvent";
import type { TournamentSummary } from "@/services/tournaments.types";

const FAST_REFRESH_MS = 3000;
const NEAR_START_MS = 3 * 60 * 1000;

export function tournamentNeedsFastLobbyRefresh(
  tournament: TournamentSummary,
  nowMs: number,
): boolean {
  if (!tournament.isRegistered) return false;
  const startTs = new Date(tournament.startTime).getTime();
  if (!Number.isFinite(startTs)) return false;
  if (tournament.status === "REGISTERING") {
    return startTs - nowMs <= NEAR_START_MS;
  }
  if (tournament.status === "LATE_REG" || tournament.status === "STARTING") {
    return true;
  }
  if (tournament.status === "RUNNING" && !tournament.tableLive) {
    return startTs <= nowMs;
  }
  return false;
}

type UseTournamentStartLobbyEffectsParams = {
  tournaments: TournamentSummary[];
  enabled: boolean;
  refreshTournaments: (opts?: { background?: boolean }) => Promise<void>;
  onTournamentCancelled?: (tournament: TournamentSummary) => void;
};

export function useTournamentStartLobbyEffects({
  tournaments,
  enabled,
  refreshTournaments,
  onTournamentCancelled,
}: UseTournamentStartLobbyEffectsParams): void {
  const nowMs = useNowMs();
  const startSoundedRef = useRef(new Set<string>());
  const prevStatusRef = useRef(new Map<string, string>());

  const joined = useMemo(() => selectJoinedTournaments(tournaments), [tournaments]);
  const fastRefresh = useMemo(
    () => joined.some((t) => tournamentNeedsFastLobbyRefresh(t, nowMs)),
    [joined, nowMs],
  );

  useEffect(() => {
    if (!enabled) return;
    for (const t of tournaments) {
      if (!t.isRegistered) continue;
      const prev = prevStatusRef.current.get(t.id);
      prevStatusRef.current.set(t.id, t.status);
      if (
        prev &&
        (prev === "REGISTERING" || prev === "STARTING") &&
        t.status === "CANCELLED"
      ) {
        onTournamentCancelled?.(t);
        void refreshTournaments({ background: true });
      }
    }
  }, [enabled, tournaments, refreshTournaments, onTournamentCancelled]);

  useEffect(() => {
    if (!enabled) return;
    for (const t of joined) {
      if (t.status !== "REGISTERING") continue;
      if (!isTournamentStartDue(t, nowMs)) continue;
      if (startSoundedRef.current.has(t.id)) continue;
      startSoundedRef.current.add(t.id);
      emitSoundEvent("table.notificationBell");
      void refreshTournaments({ background: true });
    }
  }, [enabled, joined, nowMs, refreshTournaments]);

  useEffect(() => {
    if (!enabled || !fastRefresh) return;
    const id = setInterval(() => {
      void refreshTournaments({ background: true });
    }, FAST_REFRESH_MS);
    return () => clearInterval(id);
  }, [enabled, fastRefresh, refreshTournaments]);
}
