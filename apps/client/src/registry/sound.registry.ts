/**
 * Central map of sound effects. Use static require(...) so Expo bundles assets.
 */

export type SoundCategory = "ui" | "table" | "action" | "outcome" | "notification";

export type SoundKey =
  | "tap"
  | "modalOpen"
  | "modalClose"
  | "cardDeal"
  | "cardFlip"
  | "chipStack"
  | "chipBet"
  | "fold"
  | "check"
  | "call"
  | "bet"
  | "raise"
  | "allIn"
  | "potWin"
  | "yourTurn"
  | "handReveal"
  | "toast"
  | "tableBell"
  | "error"
  | "slotPull"
  | "slotReelSpin"
  | "slotReelStop"
  | "slotWin"
  | "slotJackpot"
  | "slotJackpotFanfare"
  | "donk";

export type SoundDefinition = {
  asset: number;
  category: SoundCategory;
  volume?: number;
  cooldownMs?: number;
  maxInstances?: number;
  fallback?: "placeholder";
};

const PLACEHOLDER_ASSET = require("../../assets/sounds/placeholder.mp3");
const UI_TAP_ASSET = require("../../assets/sounds/ui/tap.wav");
const UI_MODAL_OPEN_ASSET = require("../../assets/sounds/ui/modal-open.wav");
const UI_MODAL_CLOSE_ASSET = require("../../assets/sounds/ui/modal-close.wav");
const ACTION_CHECK_ASSET = require("../../assets/sounds/action/check.wav");
const ACTION_CALL_ASSET = require("../../assets/sounds/action/call.wav");
const ACTION_BET_ASSET = require("../../assets/sounds/action/bet.wav");
const ACTION_FOLD_ASSET = require("../../assets/sounds/action/fold.wav");
const ACTION_RAISE_ASSET = require("../../assets/sounds/action/raise.wav");
const ACTION_ALL_IN_ASSET = require("../../assets/sounds/action/all-in.wav");
const NOTIFICATION_TOAST_ASSET = require("../../assets/sounds/notification/toast.wav");
const NOTIFICATION_ERROR_ASSET = require("../../assets/sounds/notification/error.wav");
const NOTIFICATION_TABLE_BELL_ASSET = require("../../assets/sounds/notification/table-bell.wav");
const NOTIFICATION_DONK_ASSET = require("../../assets/sounds/notification/donk.wav");
const CARD_DEAL_ASSET = require("../../assets/sounds/table/card-deal.wav");
const TABLE_CARD_FLIP_ASSET = require("../../assets/sounds/table/card-flip.wav");
const TABLE_CHIP_STACK_ASSET = require("../../assets/sounds/table/chip-stack.wav");
const TABLE_CHIP_BET_ASSET = require("../../assets/sounds/table/chip-bet.wav");
const OUTCOME_POT_WIN_ASSET = require("../../assets/sounds/outcome/pot-win.wav");
const OUTCOME_YOUR_TURN_ASSET = require("../../assets/sounds/outcome/your-turn.wav");
const OUTCOME_HAND_REVEAL_ASSET = require("../../assets/sounds/outcome/hand-reveal.wav");
const SLOT_PULL_ASSET = require("../../assets/sounds/click.wav");
const SLOT_REEL_SPIN_ASSET = require("../../assets/sounds/mixkit-retro-arcade-casino-notification-211.wav");
const SLOT_REEL_STOP_ASSET = require("../../assets/sounds/mixkit-game-click-1114.wav");
const SLOT_WIN_ASSET = require("../../assets/sounds/mixkit-casino-bling-achievement-2067.wav");
const SLOT_JACKPOT_ASSET = require("../../assets/sounds/mixkit-slot-machine-win-alert-1931.wav");
const SLOT_JACKPOT_FANFARE_ASSET = require("../../assets/sounds/mixkit-casino-win-notification-1986.wav");

function withPlaceholder(
  category: SoundCategory,
  overrides: Omit<SoundDefinition, "asset" | "category" | "fallback"> = {},
): SoundDefinition {
  return {
    asset: PLACEHOLDER_ASSET,
    category,
    fallback: "placeholder",
    ...overrides,
  };
}

const SOUND_MAP = {
  tap: { asset: UI_TAP_ASSET, category: "ui", cooldownMs: 60 },
  modalOpen: { asset: UI_MODAL_OPEN_ASSET, category: "ui", cooldownMs: 120 },
  modalClose: { asset: UI_MODAL_CLOSE_ASSET, category: "ui", cooldownMs: 120 },
  cardDeal: { asset: CARD_DEAL_ASSET, category: "table", cooldownMs: 40, maxInstances: 3 },
  cardFlip: { asset: TABLE_CARD_FLIP_ASSET, category: "table", cooldownMs: 80, maxInstances: 2 },
  chipStack: { asset: TABLE_CHIP_STACK_ASSET, category: "table", cooldownMs: 80, maxInstances: 2 },
  chipBet: { asset: TABLE_CHIP_BET_ASSET, category: "table", cooldownMs: 80, maxInstances: 2 },
  fold: { asset: ACTION_FOLD_ASSET, category: "action", cooldownMs: 120, maxInstances: 2 },
  check: { asset: ACTION_CHECK_ASSET, category: "action", cooldownMs: 100, maxInstances: 2 },
  call: { asset: ACTION_CALL_ASSET, category: "action", cooldownMs: 100, maxInstances: 2 },
  bet: { asset: ACTION_BET_ASSET, category: "action", cooldownMs: 100, maxInstances: 2 },
  raise: { asset: ACTION_RAISE_ASSET, category: "action", cooldownMs: 120, maxInstances: 2 },
  allIn: { asset: ACTION_ALL_IN_ASSET, category: "action", cooldownMs: 180, maxInstances: 1 },
  potWin: { asset: OUTCOME_POT_WIN_ASSET, category: "outcome", cooldownMs: 200, maxInstances: 1 },
  yourTurn: { asset: OUTCOME_YOUR_TURN_ASSET, category: "outcome", cooldownMs: 200, maxInstances: 1 },
  handReveal: { asset: OUTCOME_HAND_REVEAL_ASSET, category: "outcome", cooldownMs: 120, maxInstances: 1 },
  toast: { asset: NOTIFICATION_TOAST_ASSET, category: "notification", cooldownMs: 120, maxInstances: 1 },
  tableBell: { asset: NOTIFICATION_TABLE_BELL_ASSET, category: "notification", cooldownMs: 180, maxInstances: 1 },
  error: { asset: NOTIFICATION_ERROR_ASSET, category: "notification", cooldownMs: 200, maxInstances: 1 },
  slotPull: { asset: SLOT_PULL_ASSET, category: "action", cooldownMs: 80, maxInstances: 1 },
  slotReelSpin: { asset: SLOT_REEL_SPIN_ASSET, category: "action", cooldownMs: 120, maxInstances: 1 },
  slotReelStop: { asset: SLOT_REEL_STOP_ASSET, category: "action", cooldownMs: 80, maxInstances: 1 },
  slotWin: { asset: SLOT_WIN_ASSET, category: "outcome", cooldownMs: 180, maxInstances: 1 },
  slotJackpot: { asset: SLOT_JACKPOT_ASSET, category: "outcome", cooldownMs: 500, maxInstances: 1 },
  slotJackpotFanfare: { asset: SLOT_JACKPOT_FANFARE_ASSET, category: "outcome", cooldownMs: 3000, maxInstances: 1 },
  donk: { asset: NOTIFICATION_DONK_ASSET, category: "notification", cooldownMs: 500, maxInstances: 1 },
} satisfies Record<SoundKey, SoundDefinition>;

export { SOUND_MAP };

export const SOUND_KEYS: SoundKey[] = Object.keys(SOUND_MAP) as SoundKey[];

export function getSound(key: SoundKey): SoundDefinition {
  return SOUND_MAP[key];
}

export function getSoundsByCategory(category: SoundCategory): SoundKey[] {
  return SOUND_KEYS.filter((k) => SOUND_MAP[k].category === category);
}
