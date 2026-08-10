import { create } from "zustand";
import type { AwardGrant } from "@/types/awards";

type AwardsToastState = {
  awards: AwardGrant[];
  show: (awards: AwardGrant[]) => void;
  dismiss: () => void;
};

export const useAwardsToastStore = create<AwardsToastState>((set) => ({
  awards: [],
  show: (awards) => set({ awards }),
  dismiss: () => set({ awards: [] }),
}));
