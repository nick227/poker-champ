import { create } from "zustand";

type NavRailState = {
  expanded: boolean;
  setExpanded: (expanded: boolean) => void;
  toggle: () => void;
};

export const useNavRailStore = create<NavRailState>((set) => ({
  expanded: false,
  setExpanded: (expanded) => set({ expanded }),
  toggle: () => set((s) => ({ expanded: !s.expanded })),
}));
