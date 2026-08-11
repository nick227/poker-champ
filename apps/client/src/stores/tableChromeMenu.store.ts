import type { ReactNode } from "react";
import { create } from "zustand";

type TableChromeMenuState = {
  menu: ReactNode | null;
  setMenu: (menu: ReactNode | null) => void;
};

/** Cross-tree slot: table page publishes menu into WorkspaceStatusBar. */
export const useTableChromeMenuStore = create<TableChromeMenuState>((set) => ({
  menu: null,
  setMenu: (menu) => set({ menu }),
}));
