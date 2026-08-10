/**
 * Flat HUD action colors — solid fills, high-contrast labels.
 * No soft gradients (washed-out text on felt).
 */

export type PokerActionVariant = "fold" | "checkCall" | "betRaise" | "allIn";

export type HudActionPaint = {
  bg: string;
  border: string;
  text: string;
};

/** Casino-clear solids: fold red, call green, raise gold (dark ink), all-in orange. */
export const HUD_ACTION: Record<PokerActionVariant, HudActionPaint> = {
  fold: { bg: "#B42318", border: "#6F140F", text: "#FFFFFF" },
  checkCall: { bg: "#0F7A3A", border: "#0A4F26", text: "#FFFFFF" },
  betRaise: { bg: "#D4A017", border: "#8A6A0A", text: "#14110A" },
  allIn: { bg: "#C2410C", border: "#7C2D12", text: "#FFFFFF" },
};

export const HUD_CHIP = Object.freeze({
  bg: "#1A1F27",
  border: "#4B5563",
  text: "#F9FAFB",
  allInBorder: "#C2410C",
  allInText: "#FEE2E2",
} as const);

export const HUD_STATUS = Object.freeze({
  bg: "#12161C",
  border: "#2A3140",
  text: "#E5E7EB",
  turnBorder: "#D4A017",
} as const);

/** Flat top-bar wash (no gradient). */
export const HUD_TOPBAR_BG = "#12161C";
