import { create } from "zustand";
import { mapTournamentApiError } from "@/lib/tournament.utils";
import { getTournaments } from "@/services/get/tournaments.get";
import type { TournamentSummary } from "@/services/tournaments.types";

type TournamentsState = {
  tournaments: TournamentSummary[];
  busy: boolean;
  error: string | null;
  refresh: (opts?: { background?: boolean }) => Promise<void>;
};

export const useTournamentsStore = create<TournamentsState>((set) => ({
  tournaments: [],
  busy: false,
  error: null,
  refresh: async (opts) => {
    const background = opts?.background === true;
    if (!background) set({ busy: true, error: null });
    try {
      const tournaments = await getTournaments();
      set({ tournaments, busy: false });
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : "Failed to load tournaments";
      set({ tournaments: [], error: mapTournamentApiError(raw), busy: false });
    }
  },
}));
