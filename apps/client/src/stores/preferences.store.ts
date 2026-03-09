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
import { getThemePackSurfaces, type ThemePackId } from "@/config/themePackConfig";
import {
  type BackgroundImageId,
  type FeltGradient,
  type SurfaceBackground,
  deriveLegacyFromSurface,
  nextAppBackgroundCleared,
  nextAppBackgroundColor,
  nextAppBackgroundGradient,
  nextAppBackgroundImageId,
  nextFeltBackgroundCleared,
  nextFeltBackgroundColor,
  nextFeltBackgroundGradient,
  nextFeltBackgroundImageId,
} from "@/theme/backgrounds";

export type { FeltGradient } from "@/theme/backgrounds";

const DEFAULT_CARD_BACK_HSL = "217 50% 22%";

const DEFAULT_APP_BACKGROUND: SurfaceBackground = {
  color: "0 0% 5%",
  imageId: null,
  gradient: null,
};

const DEFAULT_FELT_BACKGROUND: SurfaceBackground = {
  color: "158 30% 14%",
  imageId: null,
  gradient: null,
};

const DEFAULT_APP_COLOR = "0 0% 5%";
const DEFAULT_FELT_COLOR = "158 30% 14%";

function legacyFromApp(bg: SurfaceBackground) {
  const d = deriveLegacyFromSurface(bg);
  return { backgroundColor: d.color ?? DEFAULT_APP_COLOR };
}

function legacyFromFelt(bg: SurfaceBackground) {
  const d = deriveLegacyFromSurface(bg);
  return {
    feltColor: d.color ?? DEFAULT_FELT_COLOR,
    feltImageId: d.imageId,
    feltGradient: d.gradient,
  };
}

type PreferencesState = {
  soundEnabled: boolean;
  masterVolume: number;
  notificationsEnabled: boolean;
  feltColor: string; // legacy; kept in sync with feltBackground
  feltGradient: FeltGradient | null;
  feltImageId: string | null;
  appBackground: SurfaceBackground;
  feltBackground: SurfaceBackground;
  cardFaceColor: string;
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
  setAppBackgroundColor: (v: string) => void;
  setAppBackgroundImageId: (v: string | null) => void;
  setAppBackgroundGradient: (v: FeltGradient | null) => void;
  clearAppBackground: () => void;
  setFeltBackgroundColor: (v: string) => void;
  setFeltBackgroundImageId: (v: string | null) => void;
  setFeltBackgroundGradient: (v: FeltGradient | null) => void;
  clearFeltBackground: () => void;
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
    (set, get) => ({
      soundEnabled: true,
      masterVolume: 1,
      notificationsEnabled: true,
      feltColor: "158 30% 14%",
      feltGradient: null,
      feltImageId: null,
      appBackground: DEFAULT_APP_BACKGROUND,
      feltBackground: DEFAULT_FELT_BACKGROUND,
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
      setAppBackgroundColor: (color) => {
        const next = nextAppBackgroundColor(get().appBackground, color);
        set({ appBackground: next, ...legacyFromApp(next) });
      },
      setAppBackgroundImageId: (id) => {
        if (id == null) {
          const next = nextAppBackgroundCleared();
          set({ appBackground: next, ...legacyFromApp(next) });
          return;
        }
        const next = nextAppBackgroundImageId(get().appBackground, id as BackgroundImageId);
        set({ appBackground: next, ...legacyFromApp(next) });
      },
      setAppBackgroundGradient: (g) => {
        if (g == null) {
          const next = nextAppBackgroundCleared();
          set({ appBackground: next, ...legacyFromApp(next) });
          return;
        }
        const next = nextAppBackgroundGradient(get().appBackground, g);
        set({ appBackground: next, ...legacyFromApp(next) });
      },
      clearAppBackground: () => {
        const next = nextAppBackgroundCleared();
        set({ appBackground: next, ...legacyFromApp(next) });
      },
      setFeltBackgroundColor: (color) => {
        const next = nextFeltBackgroundColor(get().feltBackground, color);
        set({ feltBackground: next, ...legacyFromFelt(next) });
      },
      setFeltBackgroundImageId: (id) => {
        if (id == null) {
          const next = nextFeltBackgroundCleared();
          set({ feltBackground: next, ...legacyFromFelt(next) });
          return;
        }
        const next = nextFeltBackgroundImageId(get().feltBackground, id as BackgroundImageId);
        set({ feltBackground: next, ...legacyFromFelt(next) });
      },
      setFeltBackgroundGradient: (g) => {
        if (g == null) {
          const next = nextFeltBackgroundCleared();
          set({ feltBackground: next, ...legacyFromFelt(next) });
          return;
        }
        const next = nextFeltBackgroundGradient(get().feltBackground, g);
        set({ feltBackground: next, ...legacyFromFelt(next) });
      },
      clearFeltBackground: () => {
        const next = nextFeltBackgroundCleared();
        set({ feltBackground: next, ...legacyFromFelt(next) });
      },
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
        const { background, felt } = getThemePackSurfaces(pack);
        const legacyFelt = legacyFromFelt(felt);
        const legacyApp = legacyFromApp(background);
        switch (pack) {
          case "dark":
            set({
              appBackground: background,
              feltBackground: felt,
              ...legacyFelt,
              backgroundColor: legacyApp.backgroundColor,
              cardFaceColor: "0 50% 100%",
              cardBackPackId: null,
              cardBackPattern: "minimal",
              cardBackColor: getProceduralCardBackById("minimal")?.background ?? DEFAULT_CARD_BACK_HSL,
              accentColor: "0 0% 50%",
              tableRadius: "0px",
            });
            break;
          case "monokai":
            set({
              appBackground: background,
              feltBackground: felt,
              ...legacyFelt,
              backgroundColor: legacyApp.backgroundColor,
              cardFaceColor: "60 2% 96%",
              cardBackPackId: null,
              cardBackPattern: "geometric",
              cardBackColor: getProceduralCardBackById("geometric")?.background ?? DEFAULT_CARD_BACK_HSL,
              accentColor: "340 92% 56%",
              tableRadius: "8px",
            });
            break;
          case "zen":
            set({
              appBackground: background,
              feltBackground: felt,
              ...legacyFelt,
              backgroundColor: legacyApp.backgroundColor,
              cardFaceColor: "0 0% 97%",
              cardBackPackId: null,
              cardBackPattern: "minimal",
              cardBackColor: getProceduralCardBackById("minimal")?.background ?? DEFAULT_CARD_BACK_HSL,
              accentColor: "0 0% 40%",
              tableRadius: "40px",
            });
            break;
          case "back-alley":
            set({
              appBackground: background,
              feltBackground: felt,
              ...legacyFelt,
              backgroundColor: legacyApp.backgroundColor,
              cardFaceColor: "0 0% 96%",
              cardBackPackId: null,
              cardBackPattern: "classic",
              cardBackColor: getProceduralCardBackById("classic")?.background ?? DEFAULT_CARD_BACK_HSL,
              accentColor: "0 78% 42%",
              tableRadius: "0px",
            });
            break;
          case "cyber":
            set({
              appBackground: background,
              feltBackground: felt,
              ...legacyFelt,
              backgroundColor: legacyApp.backgroundColor,
              cardFaceColor: "180 85% 96%",
              cardBackPackId: null,
              cardBackPattern: "geometric",
              cardBackColor: getProceduralCardBackById("geometric")?.background ?? DEFAULT_CARD_BACK_HSL,
              accentColor: "300 100% 42%",
              tableRadius: "4px",
            });
            break;
          default:
            set({
              appBackground: background,
              feltBackground: felt,
              ...legacyFelt,
              backgroundColor: legacyApp.backgroundColor,
              cardFaceColor: "0 0% 98%",
              cardBackPackId: null,
              cardBackPattern: "classic",
              cardBackColor: getProceduralCardBackById("classic")?.background ?? DEFAULT_CARD_BACK_HSL,
              accentColor: "42 82% 50%",
              tableRadius: "28px",
            });
        }
      },
    }),
    {
      name: "preferences-storage",
      storage: createJSONStorage(() => zustandStorage),
      version: 6,
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
        const oldBg = (state.backgroundColor as string) ?? "0 0% 5%";
        const oldFeltColor = (state.feltColor as string) ?? "158 30% 14%";
        const oldFeltImageId = state.feltImageId as string | null;
        const oldFeltGradient = state.feltGradient as FeltGradient | null;
        const appBackground: SurfaceBackground =
          state.appBackground != null && typeof state.appBackground === "object"
            ? (state.appBackground as SurfaceBackground)
            : { color: oldBg, imageId: null, gradient: null };
        const feltBackground: SurfaceBackground =
          state.feltBackground != null && typeof state.feltBackground === "object"
            ? (state.feltBackground as SurfaceBackground)
            : ({
                color: oldFeltColor,
                imageId: oldFeltImageId ?? null,
                gradient: oldFeltGradient ?? null,
              } as SurfaceBackground);
        return {
          ...rest,
          cardFacePackId: nextPackId,
          cardBackPackId: state.cardBackPackId ?? null,
          cardBackColor,
          feltGradient: state.feltGradient ?? null,
          feltImageId: state.feltImageId ?? null,
          appBackground,
          feltBackground,
        };
      },
    }
  )
);
