/**
 * Central map of sound effects. Source paths are relative to assets or URIs;
 * wire actual playback in playSound() (e.g. via expo-av) when assets exist.
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
  | "error";

export type SoundDefinition = {
  source: string;
  category: SoundCategory;
};

export const SOUND_MAP: Record<SoundKey, SoundDefinition> = {
  tap: { source: "sounds/ui/tap.mp3", category: "ui" },
  modalOpen: { source: "sounds/ui/modal-open.mp3", category: "ui" },
  modalClose: { source: "sounds/ui/modal-close.mp3", category: "ui" },
  cardDeal: { source: "sounds/table/card-deal.mp3", category: "table" },
  cardFlip: { source: "sounds/table/card-flip.mp3", category: "table" },
  chipStack: { source: "sounds/table/chip-stack.mp3", category: "table" },
  chipBet: { source: "sounds/table/chip-bet.mp3", category: "table" },
  fold: { source: "sounds/action/fold.mp3", category: "action" },
  check: { source: "sounds/action/check.mp3", category: "action" },
  call: { source: "sounds/action/call.mp3", category: "action" },
  bet: { source: "sounds/action/bet.mp3", category: "action" },
  raise: { source: "sounds/action/raise.mp3", category: "action" },
  allIn: { source: "sounds/action/all-in.mp3", category: "action" },
  potWin: { source: "sounds/outcome/pot-win.mp3", category: "outcome" },
  yourTurn: { source: "sounds/outcome/your-turn.mp3", category: "outcome" },
  handReveal: { source: "sounds/outcome/hand-reveal.mp3", category: "outcome" },
  toast: { source: "sounds/notification/toast.mp3", category: "notification" },
  tableBell: { source: "sounds/notification/table-bell.mp3", category: "notification" },
  error: { source: "sounds/notification/error.mp3", category: "notification" },
};

export const SOUND_KEYS: SoundKey[] = Object.keys(SOUND_MAP) as SoundKey[];

export function getSound(key: SoundKey): SoundDefinition {
  return SOUND_MAP[key];
}

export function getSoundsByCategory(category: SoundCategory): SoundKey[] {
  return SOUND_KEYS.filter((k) => SOUND_MAP[k].category === category);
}
