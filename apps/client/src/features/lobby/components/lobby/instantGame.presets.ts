import { getRandomTableName } from "@/services/tableNames";
import { BLINDS_OPTIONS, getMaxBuyInCents } from "./createGame.constants";

export type InstantGamePresetId = "MULTIPLAYER_RING" | "HEADS_UP_BOT";

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
  MULTIPLAYER_RING: {
    id: "MULTIPLAYER_RING",
    title: "9-Max Ring",
    body: "Jump into a full ring with bots.",
    cta: "9-Max",
    helper: "Ring · up to 9",
    maxSeats: 9,
    targetBotCount: 4,
  },
  HEADS_UP_BOT: {
    id: "HEADS_UP_BOT",
    title: "Heads-Up Match",
    body: "One-on-one bot duel.",
    cta: "Heads-Up",
    helper: "Duel · 1-on-1",
    maxSeats: 2,
    targetBotCount: 1,
  },
};

export const INSTANT_GAME_PRESET_IDS: InstantGamePresetId[] = ["MULTIPLAYER_RING", "HEADS_UP_BOT"];

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
