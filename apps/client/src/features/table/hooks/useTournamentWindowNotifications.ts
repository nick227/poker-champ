import { useEffect, useRef, useState } from "react";
import { serviceRegistry } from "@/registry/service.registry";
import { useToastStore } from "@/stores/toast.store";
import { emitSoundEvent } from "@/sound/emitSoundEvent";
import { lateRegCloseMs } from "@/lib/tournament-schedule";
import type { TournamentSummary } from "@/services/tournaments.types";

/**
 * One-shot "buy-in closed" toast when the late-registration window for the tournament at this
 * table crosses its close time while the player is watching. Purely client-timed — there is no
 * server push for this event, so a player who arrives after the window already closed does not
 * get a retroactive notification (see the `notifiedRef` seed-on-mount guard below).
 */
export function useTournamentWindowNotifications(tournamentId: string | undefined): void {
  const [tournament, setTournament] = useState<TournamentSummary | null>(null);
  const notifiedForIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!tournamentId) {
      setTournament(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await serviceRegistry.get.tournament(tournamentId);
      if (!cancelled && res.ok) setTournament(res.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [tournamentId]);

  useEffect(() => {
    if (!tournament || tournament.lateRegMinutes <= 0) return;
    const closeMs = lateRegCloseMs(tournament);

    if (Date.now() >= closeMs) {
      // Already closed before we started watching — don't fire a stale notification.
      notifiedForIdRef.current = tournament.id;
      return;
    }

    const tick = () => {
      if (Date.now() < closeMs) return;
      if (notifiedForIdRef.current === tournament.id) return;
      notifiedForIdRef.current = tournament.id;
      useToastStore.getState().show("Buy-in closed — registration is locked.");
      emitSoundEvent("table.notificationBell");
    };
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [tournament]);
}
