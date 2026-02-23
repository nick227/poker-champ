import { create } from "zustand";
import { getLobbyTables } from "@/services/get/lobby.get";
import type { OnlinePlayerSummary } from "@poker-champ/realtime-contract";

type LobbyState = {
  tables: unknown[];
  onlineTotal: number;
  onlinePlayers: OnlinePlayerSummary[];
  onlineBusy: boolean;
  onlineError: string | null;
  busy: boolean;
  error: string | null;
  transportState: "CONNECTED" | "DISCONNECTED" | "RECONNECTING";
  lobbyVoiceParticipantIds: string[];
  lobbyVoiceServerNowTs: number | null;
  refresh: (opts?: { background?: boolean }) => Promise<void>;
};

export const useLobbyStore = create<LobbyState>((set) => ({
  tables: [],
  onlineTotal: 0,
  onlinePlayers: [],
  onlineBusy: false,
  onlineError: null,
  busy: false,
  error: null,
  transportState: "DISCONNECTED",
  lobbyVoiceParticipantIds: [],
  lobbyVoiceServerNowTs: null,
  refresh: async (opts) => {
    const background = opts?.background === true;
    if (!background) set({ busy: true, error: null });
    try {
      const tables = await getLobbyTables();
      set({ tables, busy: false });
    } catch (e: any) {
      set({ error: e?.message ?? "Failed to load tables", busy: false });
    }
  },
}));
