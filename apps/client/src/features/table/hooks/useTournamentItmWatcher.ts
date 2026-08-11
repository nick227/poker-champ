import { useEffect, useRef } from "react";
import { getTournamentStandings } from "@/services/get/tournaments.get";
import { getTournamentPayoutSlots } from "@/lib/tournament-detail";
import { useToastStore } from "@/stores/toast.store";
import { emitHapticEvent } from "@/haptics/emitHapticEvent";

const POLL_MS = 25_000;

/**
 * Notifies a still-playing hero once the field has narrowed to where their remaining stack
 * guarantees a paid finish ("in the money"). `remainingCount <= paidSlotCount` is exact (finish
 * places are assigned in elimination order), not an approximation — see
 * docs/plans/gentle-gathering-parasol.md item 4.
 */
export function useTournamentItmWatcher(
  tournamentId: string | undefined,
  isPlaying: boolean,
): void {
  const wasItmRef = useRef(false);

  useEffect(() => {
    if (!tournamentId || !isPlaying) {
      wasItmRef.current = false;
      return;
    }
    let cancelled = false;
    // Distinguishes "this is the first observation since (re)mount" from a live transition —
    // without it, a remount (reconnect, tab nav) while already ITM would refire the toast, since
    // wasItmRef always starts false on a fresh mount.
    let hasCheckedOnce = false;

    const check = async () => {
      try {
        const standings = await getTournamentStandings(tournamentId);
        if (cancelled || standings.length === 0) return;
        const remainingCount = standings.filter((s) => s.finishPlace == null).length;
        const paidSlotCount = getTournamentPayoutSlots(standings.length).length;
        const isGuaranteedItm = remainingCount > 0 && remainingCount <= paidSlotCount;

        if (!hasCheckedOnce) {
          hasCheckedOnce = true;
          wasItmRef.current = isGuaranteedItm;
          return;
        }
        if (isGuaranteedItm && !wasItmRef.current) {
          wasItmRef.current = true;
          useToastStore.getState().show("You're in the money!", "success");
          emitHapticEvent("tournament.itmWin");
        } else if (!isGuaranteedItm) {
          wasItmRef.current = false;
        }
      } catch {
        // Best-effort notification; skip this tick and retry on the next poll.
      }
    };

    void check();
    const id = setInterval(() => void check(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [tournamentId, isPlaying]);
}
