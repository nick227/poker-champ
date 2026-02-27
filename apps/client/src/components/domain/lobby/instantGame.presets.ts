import { getRandomTableName } from "@/services/tableNames";
import { BLINDS_OPTIONS, getDefaultMinBuyInCents, getMaxBuyInCents } from "./createGame.constants";

export type InstantGamePresetId = "SIX_BOT_RING" | "HEADS_UP_BOT";

type InstantGamePreset = {
  id: InstantGamePresetId;
  title: string;
  body: string;
  subtitle: string;
  cta: string;
  helper: string;
  maxSeats: number;
  targetBotCount: number;
};

const DEFAULT_BLINDS = BLINDS_OPTIONS[3];
const DEFAULT_MIN_BUY_IN = getDefaultMinBuyInCents(DEFAULT_BLINDS.bigBlindCents);
const DEFAULT_MAX_BUY_IN = getMaxBuyInCents(DEFAULT_BLINDS.bigBlindCents);

const PRESETS: Record<InstantGamePresetId, InstantGamePreset> = {
  SIX_BOT_RING: {
    id: "SIX_BOT_RING",
    title: "6-Bot Ring",
    body: "Start a full table instantly with five bots.",
    subtitle: "You + 5 bots | Random table name",
    cta: "Start 6-Bot Game",
    helper: "One tap: create, join, and auto-fill",
    maxSeats: 6,
    targetBotCount: 5,
  },
  HEADS_UP_BOT: {
    id: "HEADS_UP_BOT",
    title: "Heads-Up Bot Duel",
    body: "Warm up quickly in a one-on-one bot battle.",
    subtitle: "You + 1 bot | Random table name",
    cta: "Start Heads-Up",
    helper: "One tap: create and play",
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
    smallBlindCents: DEFAULT_BLINDS.smallBlindCents,
    bigBlindCents: DEFAULT_BLINDS.bigBlindCents,
    minBuyInCents: DEFAULT_MIN_BUY_IN,
    maxBuyInCents: DEFAULT_MAX_BUY_IN,
    visibility: "PUBLIC" as const,
    showStats: true,
  };
}
