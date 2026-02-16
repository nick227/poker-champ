import { create } from "zustand";

type PreferencesState = {
  soundEnabled: boolean;
  notificationsEnabled: boolean;
  setSoundEnabled: (v: boolean) => void;
  setNotificationsEnabled: (v: boolean) => void;
};

export const usePreferencesStore = create<PreferencesState>((set) => ({
  soundEnabled: true,
  notificationsEnabled: true,
  setSoundEnabled: (v) => set({ soundEnabled: v }),
  setNotificationsEnabled: (v) => set({ notificationsEnabled: v }),
}));
