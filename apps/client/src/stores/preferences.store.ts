import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { zustandStorage } from "@/lib/storage";
import {
  DEFAULT_CARD_FACE_PACK_ID,
  getValidCardFacePackId,
  type CardFacePackId,
} from "@/assets/cards/packs";

type CardBackPattern = "classic" | "geometric" | "ornate" | "minimal" | "gradient";

type PreferencesState = {
  soundEnabled: boolean;
  masterVolume: number;
  notificationsEnabled: boolean;
  feltColor: string; // HSL components
  cardFaceColor: string; // HSL components
  cardFacePackId: CardFacePackId;
  cardBackColor: string; // HSL components (legacy, for backward compatibility)
  cardBackPattern: CardBackPattern;
  cardBackHue: number; // 0-360 for HSL hue
  cardBackSaturation: number; // 0-100%
  cardBackLightness: number; // 0-100%
  accentColor: string; // HSL components
  backgroundColor: string; // HSL components
  tableRadius: string; // css value
  setSoundEnabled: (v: boolean) => void;
  setMasterVolume: (v: number) => void;
  setNotificationsEnabled: (v: boolean) => void;
  setFeltColor: (v: string) => void;
  setCardFaceColor: (v: string) => void;
  setCardFacePackId: (id: CardFacePackId) => void;
  setCardBackColor: (v: string) => void;
  setCardBackPattern: (pattern: CardBackPattern) => void;
  setCardBackHue: (hue: number) => void;
  setCardBackSaturation: (saturation: number) => void;
  setCardBackLightness: (lightness: number) => void;
  setAccentColor: (v: string) => void;
  setBackgroundColor: (v: string) => void;
  setTableRadius: (v: string) => void;
  applyThemePack: (pack: "default" | "monokai" | "zen" | "back-alley" | "cyber" | "mono") => void;
};

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      soundEnabled: true,
      masterVolume: 1,
      notificationsEnabled: true,
      feltColor: "158 30% 14%",
      cardFaceColor: "0 0% 98%",
      cardFacePackId: DEFAULT_CARD_FACE_PACK_ID,
      cardBackColor: "217 50% 22%",
      cardBackPattern: "classic",
      cardBackHue: 217,
      cardBackSaturation: 50,
      cardBackLightness: 22,
      accentColor: "42 82% 50%",
      backgroundColor: "0 0% 5%",
      tableRadius: "28px",
      setSoundEnabled: (v) => set({ soundEnabled: v }),
      setMasterVolume: (v) => set({ masterVolume: Math.max(0, Math.min(1, v)) }),
      setNotificationsEnabled: (v) => set({ notificationsEnabled: v }),
      setFeltColor: (v) => set({ feltColor: v }),
      setCardFaceColor: (v) => set({ cardFaceColor: v }),
      setCardFacePackId: (id) => set({ cardFacePackId: getValidCardFacePackId(id) }),
      setCardBackColor: (v) => set({ cardBackColor: v }),
      setCardBackPattern: (pattern) => set({ cardBackPattern: pattern }),
      setCardBackHue: (hue) => set({ cardBackHue: Math.max(0, Math.min(360, hue)) }),
      setCardBackSaturation: (saturation) => set({ cardBackSaturation: Math.max(0, Math.min(100, saturation)) }),
      setCardBackLightness: (lightness) => set({ cardBackLightness: Math.max(0, Math.min(100, lightness)) }),
      setAccentColor: (v) => set({ accentColor: v }),
      setBackgroundColor: (v) => set({ backgroundColor: v }),
      setTableRadius: (v) => set({ tableRadius: v }),
      applyThemePack: (pack) => {
        switch (pack) {
          case "mono":
            set({
              feltColor: "0 0 0%",
              cardFaceColor: "0 50% 100%",
              cardBackColor: "0 0% 100%",
              cardBackPattern: "minimal",
              cardBackHue: 0,
              cardBackSaturation: 0,
              cardBackLightness: 100,
              accentColor: "100 33% 50%",
              backgroundColor: "0 0% 100%",
              tableRadius: "0px",
            });
            break;
          case "monokai":
            set({
              feltColor: "70 8% 15%",
              cardFaceColor: "60 30% 96%",
              cardBackColor: "340 72% 30%",
              cardBackPattern: "geometric",
              cardBackHue: 340,
              cardBackSaturation: 72,
              cardBackLightness: 30,
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
              cardBackPattern: "minimal",
              cardBackHue: 0,
              cardBackSaturation: 0,
              cardBackLightness: 20,
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
              cardBackPattern: "classic",
              cardBackHue: 0,
              cardBackSaturation: 78,
              cardBackLightness: 26,
              accentColor: "0 78% 42%",
              backgroundColor: "0 0% 2%",
              tableRadius: "0px",
            });
            break;
          case "cyber":
            set({
              feltColor: "249 100% 58%",
              cardFaceColor: "180 85% 96%",
              cardBackColor: "300 100% 22%",
              cardBackPattern: "geometric",
              cardBackHue: 300,
              cardBackSaturation: 100,
              cardBackLightness: 22,
              accentColor: "300 100% 42%",
              backgroundColor: "249 50% 5%",
              tableRadius: "4px",
            });
            break;
          default:
            set({
              feltColor: "158 30% 14%",
              cardFaceColor: "0 0% 98%",
              cardBackColor: "217 50% 22%",
              cardBackPattern: "classic",
              cardBackHue: 217,
              cardBackSaturation: 50,
              cardBackLightness: 22,
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
      version: 1,
      migrate: (persistedState) => {
        if (!persistedState || typeof persistedState !== "object") return persistedState;
        const state = persistedState as Record<string, unknown>;
        const currentPackId = state.cardFacePackId;
        const nextPackId =
          currentPackId == null
            ? DEFAULT_CARD_FACE_PACK_ID
            : getValidCardFacePackId(currentPackId);
        return {
          ...state,
          cardFacePackId: nextPackId,
        };
      },
    }
  )
);
