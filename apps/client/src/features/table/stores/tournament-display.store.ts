import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { TableAmountDisplayMode } from "@/lib/money/table-money";
import { zustandStorage } from "@/lib/storage";

type TournamentDisplayState = {
  tableAmountMode: TableAmountDisplayMode;
  setTableAmountMode: (mode: TableAmountDisplayMode) => void;
};

export const useTournamentDisplayStore = create<TournamentDisplayState>()(
  persist(
    (set) => ({
      tableAmountMode: "chips",
      setTableAmountMode: (tableAmountMode) => set({ tableAmountMode }),
    }),
    {
      name: "tournament-display",
      storage: createJSONStorage(() => zustandStorage),
      partialize: (state) => ({ tableAmountMode: state.tableAmountMode }),
    },
  ),
);
