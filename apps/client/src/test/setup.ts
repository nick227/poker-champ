import React from "react";
import { vi } from "vitest";

// Define __DEV__ for test environment
(globalThis as any).__DEV__ = false;
// So components compiled with classic JSX (React.createElement) have React in scope
(globalThis as any).React = React;

const STUB_ASSET = 0;
const SOUND_KEYS_LIST = [
  "tap", "modalOpen", "modalClose", "cardDeal", "cardFlip", "chipStack", "chipBet",
  "fold", "check", "call", "bet", "raise", "allIn", "potWin", "yourTurn", "handReveal",
  "toast", "tableBell", "playerJoined", "error", "slotPull", "slotReelSpin", "slotReelStop",
  "slotWin", "slotJackpot", "slotJackpotFanfare", "donk",
];

const stubDef = (category: string, cooldownMs: number, maxInstances = 1) =>
  ({ asset: STUB_ASSET, category, cooldownMs, maxInstances });

const SOUND_MAP: Record<string, { asset: number; category: string; cooldownMs: number; maxInstances: number }> = {
  tap: stubDef("ui", 60),
  modalOpen: stubDef("ui", 120),
  modalClose: stubDef("ui", 120),
  cardDeal: { ...stubDef("table", 40, 3), maxInstances: 3 },
  cardFlip: { ...stubDef("table", 80, 2), maxInstances: 2 },
  chipStack: { ...stubDef("table", 80, 2), maxInstances: 2 },
  chipBet: { ...stubDef("table", 80, 2), maxInstances: 2 },
  fold: stubDef("action", 120, 2),
  check: stubDef("action", 100, 2),
  call: stubDef("action", 100, 2),
  bet: stubDef("action", 100, 2),
  raise: stubDef("action", 120, 2),
  allIn: stubDef("action", 180, 1),
  potWin: stubDef("outcome", 200, 1),
  yourTurn: stubDef("outcome", 200, 1),
  handReveal: stubDef("outcome", 120, 1),
  toast: stubDef("notification", 120, 1),
  tableBell: stubDef("notification", 180, 1),
  playerJoined: stubDef("notification", 180, 1),
  error: stubDef("notification", 200, 1),
  slotPull: stubDef("action", 80, 1),
  slotReelSpin: stubDef("action", 120, 1),
  slotReelStop: stubDef("action", 80, 1),
  slotWin: stubDef("outcome", 180, 1),
  slotJackpot: stubDef("outcome", 500, 1),
  slotJackpotFanfare: stubDef("outcome", 3000, 1),
  donk: stubDef("notification", 500, 1),
};

vi.mock("@/registry/sound.registry", () => ({
  SOUND_MAP,
  SOUND_KEYS: SOUND_KEYS_LIST,
  getSound: (key: string) => SOUND_MAP[key],
  getSoundsByCategory: (category: string) =>
    SOUND_KEYS_LIST.filter((k) => SOUND_MAP[k].category === category),
}));

const noop = () => {};

vi.mock("expo-router", () => {
  const Stack = Object.assign(noop, { Screen: noop });
  const Redirect = noop;
  const Link = ({ children }: { children?: unknown }) => children ?? null;

  return {
    Stack,
    Redirect,
    Link,
    useRouter: () => ({
      push: noop,
      replace: noop,
      back: noop,
      setParams: noop,
      canGoBack: () => false,
    }),
    useLocalSearchParams: () => ({}),
    usePathname: () => "/",
  };
});

vi.mock("@react-navigation/native", () => ({
  DarkTheme: {},
  ThemeProvider: ({ children }: { children?: unknown }) => children ?? null,
  useNavigation: () => ({
    navigate: noop,
    goBack: noop,
    dispatch: noop,
    setOptions: noop,
  }),
}));

vi.mock("expo-av", () => {
  const Video = (_props: unknown) => null;
  const Audio = {
    Sound: class {
      static createAsync = vi.fn(() => Promise.resolve({ sound: { playAsync: vi.fn(), unloadAsync: vi.fn() } }));
    },
  };
  return { Video, Audio };
});

vi.mock("@/features/table/animations/video.registry", () => ({
  getVideoAsset: (_key: string) => undefined,
}));
