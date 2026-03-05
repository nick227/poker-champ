import { getRandomTableName } from "@/services/tableNames";
import { BLINDS_OPTIONS, getMaxBuyInCents } from "./createGame.constants";

export type InstantGamePresetId = "SIX_BOT_RING" | "HEADS_UP_BOT";

type InstantGamePreset = {
  id: InstantGamePresetId;
  title: string;
  body: string;
  cta: string;
  helper: string;
  maxSeats: number;
  targetBotCount: number;
};

/** 1/2 stakes, same default as CreateGameModal (DEFAULT_BLINDS_INDEX = 0). */
const INSTANT_BLINDS = BLINDS_OPTIONS[0];
const INSTANT_MIN_BUY_IN_CENTS = 2000; // $20 = 10 BB at 1/2
const INSTANT_MAX_BUY_IN_CENTS = getMaxBuyInCents(INSTANT_BLINDS.bigBlindCents); // $200 = 100 BB

const PRESETS: Record<InstantGamePresetId, InstantGamePreset> = {
  SIX_BOT_RING: {
    id: "SIX_BOT_RING",
    title: "6-Bot Ring",
    body: "Battle with five bots.",
    cta: "Start 6-Bot Game",
    helper: "",
    maxSeats: 6,
    targetBotCount: 5,
  },
  HEADS_UP_BOT: {
    id: "HEADS_UP_BOT",
    title: "Heads-Up Duel",
    body: "One-on-one bot battle.",
    cta: "Start Heads-Up",
    helper: "",
    maxSeats: 2,
    targetBotCount: 1,
  },
};

export const INSTANT_GAME_PRESET_IDS: InstantGamePresetId[] = ["SIX_BOT_RING", "HEADS_UP_BOT"];

export function getInstantGamePreset(presetId: InstantGamePresetId): InstantGamePreset {
  return PRESETS[presetId];
}

export function buildInstantCreateTableConfig(presetId: InstantGamePresetId) {
  const preset = PRESETS[presetId];
  return {
    name: getRandomTableName(),
    maxSeats: preset.maxSeats,
    smallBlindCents: INSTANT_BLINDS.smallBlindCents,
    bigBlindCents: INSTANT_BLINDS.bigBlindCents,
    minBuyInCents: INSTANT_MIN_BUY_IN_CENTS,
    maxBuyInCents: INSTANT_MAX_BUY_IN_CENTS,
    visibility: "PUBLIC" as const,
    showStats: false,
  };
}
