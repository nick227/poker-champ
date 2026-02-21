import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { zustandStorage } from "@/lib/storage";

type PreferencesState = {
  soundEnabled: boolean;
  masterVolume: number;
  notificationsEnabled: boolean;
  feltColor: string; // HSL components
  cardFaceColor: string; // HSL components
  cardBackColor: string; // HSL components
  accentColor: string; // HSL components
  backgroundColor: string; // HSL components
  tableRadius: string; // css value
  setSoundEnabled: (v: boolean) => void;
  setMasterVolume: (v: number) => void;
  setNotificationsEnabled: (v: boolean) => void;
  setFeltColor: (v: string) => void;
  setCardFaceColor: (v: string) => void;
  setCardBackColor: (v: string) => void;
  setAccentColor: (v: string) => void;
  setBackgroundColor: (v: string) => void;
  setTableRadius: (v: string) => void;
  applyThemePack: (pack: "default" | "monokai" | "zen" | "back-alley" | "cyber") => void;
};

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      soundEnabled: true,
      masterVolume: 1,
      notificationsEnabled: true,
      feltColor: "158 30% 14%",
      cardFaceColor: "0 0% 98%",
      cardBackColor: "217 50% 22%",
      accentColor: "42 82% 50%",
      backgroundColor: "0 0% 5%",
      tableRadius: "28px",
      setSoundEnabled: (v) => set({ soundEnabled: v }),
      setMasterVolume: (v) => set({ masterVolume: Math.max(0, Math.min(1, v)) }),
      setNotificationsEnabled: (v) => set({ notificationsEnabled: v }),
      setFeltColor: (v) => set({ feltColor: v }),
      setCardFaceColor: (v) => set({ cardFaceColor: v }),
      setCardBackColor: (v) => set({ cardBackColor: v }),
      setAccentColor: (v) => set({ accentColor: v }),
      setBackgroundColor: (v) => set({ backgroundColor: v }),
      setTableRadius: (v) => set({ tableRadius: v }),
      applyThemePack: (pack) => {
        switch (pack) {
          case "monokai":
            set({
              feltColor: "70 8% 15%",
              cardFaceColor: "60 30% 96%",
              cardBackColor: "340 72% 30%",
              accentColor: "340 72% 40%",
              backgroundColor: "70 8% 10%",
              tableRadius: "8px",
            });
            break;
          case "zen":
            set({
              feltColor: "0 0% 12%",
              cardFaceColor: "0 0% 97%",
              cardBackColor: "0 0% 20%",
              accentColor: "0 0% 40%",
              backgroundColor: "0 0% 8%",
              tableRadius: "40px",
            });
            break;
          case "back-alley":
            set({
              feltColor: "0 0% 5%",
              cardFaceColor: "0 0% 96%",
              cardBackColor: "0 78% 26%",
              accentColor: "0 78% 42%",
              backgroundColor: "0 0% 2%",
              tableRadius: "0px",
            });
            break;
          case "cyber":
            set({
              feltColor: "280 40% 10%",
              cardFaceColor: "180 85% 96%",
              cardBackColor: "300 100% 22%",
              accentColor: "300 100% 42%",
              backgroundColor: "280 50% 5%",
              tableRadius: "4px",
            });
            break;
          default:
            set({
              feltColor: "158 30% 14%",
              cardFaceColor: "0 0% 98%",
              cardBackColor: "217 50% 22%",
              accentColor: "42 82% 50%",
              backgroundColor: "0 0% 5%",
              tableRadius: "28px",
            });
        }
      },
    }),
    {
      name: "preferences-storage",
      storage: createJSONStorage(() => zustandStorage),
    }
  )
);
