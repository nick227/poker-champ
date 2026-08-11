import { create } from "zustand";

type BankrollState = {
  cents: number | null;
  setCents: (cents: number) => void;
  applyDelta: (deltaCents: number) => void;
  clear: () => void;
};

/** Shared wallet shown in the workspace status bar and used by slots. */
export const useBankrollStore = create<BankrollState>((set, get) => ({
  cents: null,
  setCents: (cents) => set({ cents: Math.max(0, Math.round(cents)) }),
  applyDelta: (deltaCents) => {
    const cur = get().cents ?? 0;
    set({ cents: Math.max(0, Math.round(cur + deltaCents)) });
  },
  clear: () => set({ cents: null }),
}));
