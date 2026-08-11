import { useCallback, useState } from "react";
import { serviceRegistry } from "@/registry/service.registry";
import { useToastStore } from "@/stores/toast.store";

/** Lets a rebuy-pending player decline the rebuy and finalize elimination immediately. */
export function useLeaveTournament(tournamentId: string | undefined) {
  const [busy, setBusy] = useState(false);

  const leaveTournament = useCallback(async () => {
    if (!tournamentId || busy) return;
    setBusy(true);
    try {
      await serviceRegistry.post.tournamentLeave(tournamentId);
      useToastStore.getState().show("You left the tournament.", "default");
    } catch (e) {
      useToastStore.getState().show((e as Error).message ?? "Could not leave tournament", "danger");
    } finally {
      setBusy(false);
    }
  }, [tournamentId, busy]);

  return { leaveTournament, leaveTournamentBusy: busy };
}
