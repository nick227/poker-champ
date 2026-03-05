import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { zustandStorage } from "@/lib/storage";
import {
  DEFAULT_CARD_BACK_PATTERN_ID,
  getProceduralCardBackById,
  type CardBackPatternId,
} from "@/assets/cards/cardBackProcedural";
import {
  DEFAULT_CARD_FACE_PACK_ID,
  getValidCardFacePackId,
  type CardBackPackId,
  type CardFacePackId,
} from "@/assets/cards/packs";
import { getThemePackFeltImageId, type ThemePackId } from "@/config/themePackConfig";

const DEFAULT_CARD_BACK_HSL = "217 50% 22%";

/** When set, felt is rendered as a gradient; otherwise solid feltColor. */
export type FeltGradient = {
  kind?: "linear" | "radial";
  colors: string[];
  angleDeg?: number;
};

type PreferencesState = {
  soundEnabled: boolean;
  masterVolume: number;
  notificationsEnabled: boolean;
  feltColor: string; // HSL components (solid, or first stop for gradient)
  feltGradient: FeltGradient | null; // when set, felt uses gradient
  feltImageId: string | null; // when set, felt uses image background
  cardFaceColor: string; // HSL components
  cardFacePackId: CardFacePackId;
  cardBackPackId: CardBackPackId | null; // null = use procedural (cardBackPattern; colors from manifest)
  cardBackColor: string; // HSL "H S% L%" — used for --c-card-back (TableSceneShell); kept in sync with procedural pattern when applying theme
  cardBackPattern: CardBackPatternId;
  accentColor: string; // HSL components
  backgroundColor: string; // HSL components
  tableRadius: string; // css value
  setSoundEnabled: (v: boolean) => void;
  setMasterVolume: (v: number) => void;
  setNotificationsEnabled: (v: boolean) => void;
  setFeltColor: (v: string) => void;
  setFeltGradient: (v: FeltGradient | null) => void;
  setFeltImageId: (v: string | null) => void;
  setCardFaceColor: (v: string) => void;
  setCardFacePackId: (id: CardFacePackId) => void;
  setCardBackPackId: (id: CardBackPackId | null) => void;
  setCardBackColor: (v: string) => void;
  setCardBackPattern: (pattern: CardBackPatternId) => void;
  setAccentColor: (v: string) => void;
  setBackgroundColor: (v: string) => void;
  setTableRadius: (v: string) => void;
  applyThemePack: (pack: ThemePackId) => void;
};

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      soundEnabled: true,
      masterVolume: 1,
      notificationsEnabled: true,
      feltColor: "158 30% 14%",
      feltGradient: null,
      feltImageId: null,
      cardFaceColor: "0 0% 98%",
      cardFacePackId: DEFAULT_CARD_FACE_PACK_ID,
      cardBackPackId: null,
      cardBackColor: DEFAULT_CARD_BACK_HSL,
      cardBackPattern: DEFAULT_CARD_BACK_PATTERN_ID,
      accentColor: "42 82% 50%",
      backgroundColor: "0 0% 5%",
      tableRadius: "28px",
      setSoundEnabled: (v) => set({ soundEnabled: v }),
      setMasterVolume: (v) => set({ masterVolume: Math.max(0, Math.min(1, v)) }),
      setNotificationsEnabled: (v) => set({ notificationsEnabled: v }),
      setFeltColor: (v) => set({ feltColor: v }),
      setFeltGradient: (v) => set({ feltGradient: v }),
      setFeltImageId: (v) => set({ feltImageId: v }),
      setCardFaceColor: (v) => set({ cardFaceColor: v }),
      setCardFacePackId: (id) => set({ cardFacePackId: getValidCardFacePackId(id) }),
      setCardBackPackId: (id) => set({ cardBackPackId: id }),
      setCardBackColor: (v) => set({ cardBackColor: v }),
      setCardBackPattern: (pattern) =>
        set({
          cardBackPattern: pattern,
          cardBackColor: getProceduralCardBackById(pattern)?.background ?? DEFAULT_CARD_BACK_HSL,
        }),
      setAccentColor: (v) => set({ accentColor: v }),
      setBackgroundColor: (v) => set({ backgroundColor: v }),
      setTableRadius: (v) => set({ tableRadius: v }),
      applyThemePack: (pack) => {
        const feltImageId = getThemePackFeltImageId(pack);
        switch (pack) {
          case "dark":
            set({
              feltColor: "0 0% 0%",
              feltGradient: null,
              feltImageId,
              cardFaceColor: "0 50% 100%",
              cardBackPackId: null,
              cardBackPattern: "minimal",
              cardBackColor: getProceduralCardBackById("minimal")?.background ?? DEFAULT_CARD_BACK_HSL,
              accentColor: "0 0% 50%",
              backgroundColor: "0 0% 0%",
              tableRadius: "0px",
            });
            break;
          case "monokai":
            set({
              feltColor: "70 8% 15%",
              feltGradient: null,
              feltImageId,
              cardFaceColor: "60 2% 96%",
              cardBackPackId: null,
              cardBackPattern: "geometric",
              cardBackColor: getProceduralCardBackById("geometric")?.background ?? DEFAULT_CARD_BACK_HSL,
              accentColor: "340 92% 56%",
              backgroundColor: "70 8% 15%",
              tableRadius: "8px",
            });
            break;
          case "zen":
            set({
              feltColor: "0 0% 12%",
              feltGradient: { kind: "radial", colors: ["0 0% 14%", "0 0% 12%", "0 0% 10%"] },
              feltImageId,
              cardFaceColor: "0 0% 97%",
              cardBackPackId: null,
              cardBackPattern: "minimal",
              cardBackColor: getProceduralCardBackById("minimal")?.background ?? DEFAULT_CARD_BACK_HSL,
              accentColor: "0 0% 40%",
              backgroundColor: "0 0% 8%",
              tableRadius: "40px",
            });
            break;
          case "back-alley":
            set({
              feltColor: "0 0% 5%",
              feltGradient: null,
              feltImageId,
              cardFaceColor: "0 0% 96%",
              cardBackPackId: null,
              cardBackPattern: "classic",
              cardBackColor: getProceduralCardBackById("classic")?.background ?? DEFAULT_CARD_BACK_HSL,
              accentColor: "0 78% 42%",
              backgroundColor: "0 0% 2%",
              tableRadius: "0px",
            });
            break;
          case "cyber":
            set({
              feltColor: "249 100% 58%",
              feltGradient: null,
              feltImageId,
              cardFaceColor: "180 85% 96%",
              cardBackPackId: null,
              cardBackPattern: "geometric",
              cardBackColor: getProceduralCardBackById("geometric")?.background ?? DEFAULT_CARD_BACK_HSL,
              accentColor: "300 100% 42%",
              backgroundColor: "249 50% 5%",
              tableRadius: "4px",
            });
            break;
          default:
            set({
              feltColor: "158 30% 14%",
              feltGradient: { kind: "radial", colors: ["158 28% 16%", "158 30% 14%", "158 32% 12%"] },
              feltImageId,
              cardFaceColor: "0 0% 98%",
              cardBackPackId: null,
              cardBackPattern: "classic",
              cardBackColor: getProceduralCardBackById("classic")?.background ?? DEFAULT_CARD_BACK_HSL,
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
      version: 5,
      migrate: (persistedState) => {
        if (!persistedState || typeof persistedState !== "object") return persistedState;
        const state = persistedState as Record<string, unknown>;
        const currentPackId = state.cardFacePackId;
        const nextPackId =
          currentPackId == null
            ? DEFAULT_CARD_FACE_PACK_ID
            : getValidCardFacePackId(currentPackId);
        const cardBackPattern = state.cardBackPattern as CardBackPatternId | undefined;
        const proceduralColor =
          state.cardBackPackId == null && typeof cardBackPattern === "string"
            ? getProceduralCardBackById(cardBackPattern)?.background
            : undefined;
        const cardBackColor =
          (proceduralColor ?? (state.cardBackColor as string)) ?? DEFAULT_CARD_BACK_HSL;
        const { cardBackHue, cardBackSaturation, cardBackLightness, ...rest } = state;
        return {
          ...rest,
          cardFacePackId: nextPackId,
          cardBackPackId: state.cardBackPackId ?? null,
          cardBackColor,
          feltGradient: state.feltGradient ?? null,
          feltImageId: state.feltImageId ?? null,
        };
      },
    }
  )
);
