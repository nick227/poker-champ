import { ImageSourcePropType } from "react-native";
import type { SymbolKey } from "../../games/types";
import type { CabinetMood } from "../slots/MachineCabinet";

export const DEFAULT_SYMBOL_HEIGHT = 120;
export const MIN_SYMBOL_HEIGHT = 48;
export const REEL_REPEAT_COUNT = 7;

export const SLOT_SYMBOL_ASSETS = {
  A: require("../../../assets/symbols/A.png"),
  B: require("../../../assets/symbols/B.png"),
  C: require("../../../assets/symbols/C.png"),
  D: require("../../../assets/symbols/D.png"),
  E: require("../../../assets/symbols/E.png"),
  F: require("../../../assets/symbols/F.png"),
  "7": require("../../../assets/symbols/7.png"),
} satisfies Record<SymbolKey, ImageSourcePropType>;

export function clampSymbolHeight(reelHeight: number): number {
  return Math.max(MIN_SYMBOL_HEIGHT, Math.floor(reelHeight / 3));
}

export function moodFor(
  busy: boolean,
  nearWin: boolean,
  canSpin: boolean,
  jackpot: boolean,
  winning: boolean,
): CabinetMood {
  if (busy && nearWin) return "near-win";
  if (busy) return "spinning";
  if (jackpot) return "jackpot";
  if (winning) return "win";
  if (!canSpin) return "disabled";
  return "idle";
}
