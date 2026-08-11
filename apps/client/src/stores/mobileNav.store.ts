import { create } from "zustand";

type MobileNavState = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
};

/** Open/closed state for the mobile primary-nav sheet (hamburger in WorkspaceStatusBar). */
export const useMobileNavStore = create<MobileNavState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
}));
