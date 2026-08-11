/**
 * Slot cabinet palette — app dark surfaces + gold bezel.
 * Neutrals align with tokens.css: --c-bg / --c-panel / --c-panel-elevated / --c-border.
 */
export const casino = {
  goldHi: "#ffe08a",
  gold: "#e6b422",
  goldMid: "#c4921a",
  goldLo: "#8a6410",
  /** --c-bg 0 0% 5% */
  bg: "#0d0d0d",
  /** --c-panel 0 0% 9% */
  panel: "#171717",
  /** --c-panel-elevated 0 0% 12% */
  panelHi: "#1f1f1f",
  /** --c-border 0 0% 18% */
  border: "#2e2e2e",
  reelFace: "#0d0d0d",
  reelFaceShade: "#1f1f1f",
  bulbOn: "#fff8e7",
  bulbOff: "#c9a227",
  ink: "#0d0d0d",
  /** Win FX accent (not housing). */
  flash: "#e05353",
} as const;
