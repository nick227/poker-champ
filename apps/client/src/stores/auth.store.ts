import { create } from "zustand";
import { setAuthToken } from "@poker-champ/sdk";
import { clearAuthToken, loadAuthToken, saveAuthToken } from "@/lib/authTokenStorage";
import { useProfileStore } from "@/stores/profile.store";

type AuthState = {
  token: string | null;
  hydrated: boolean;
  setToken: (t: string | null) => void;
  logout: () => void;
  hydrateToken: () => Promise<void>;
  markHydrated: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  hydrated: false,
  setToken: (t) => {
    set({ token: t });
    setAuthToken(t);
    if (t) {
      void saveAuthToken(t);
      return;
    }
    void clearAuthToken();
  },
  logout: () => {
    set({ token: null });
    setAuthToken(null);
    void clearAuthToken();
    useProfileStore.getState().setProfile({});
  },
  hydrateToken: async () => {
    const token = await loadAuthToken();
    set({ token });
    setAuthToken(token);
  },
  markHydrated: () => set({ hydrated: true }),
}));
