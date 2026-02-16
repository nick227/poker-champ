import { create } from "zustand";
import { getLobbyTables } from "@/services/get/lobby.get";

type LobbyState = {
  tables: any[];
  busy: boolean;
  error: string | null;
  transportState: "CONNECTED" | "DISCONNECTED" | "RECONNECTING";
  refresh: () => Promise<void>;
};

export const useLobbyStore = create<LobbyState>((set) => ({
  tables: [],
  busy: false,
  error: null,
  transportState: "DISCONNECTED",
  refresh: async () => {
    set({ busy: true, error: null });
    try {
      const tables = await getLobbyTables();
      set({ tables, busy: false });
    } catch (e: any) {
      set({ error: e?.message ?? "Failed to load tables", busy: false });
    }
  },
}));
