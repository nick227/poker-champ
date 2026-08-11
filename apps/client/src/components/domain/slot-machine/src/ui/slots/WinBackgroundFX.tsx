/**
 * Compatibility shim — WinBackgroundFX was replaced by SlotScreenFx.
 * Kept so stale Metro/HMR bundles that still import this path do not crash.
 */
export { SlotScreenFx as WinBackgroundFX } from "./SlotScreenFx";
