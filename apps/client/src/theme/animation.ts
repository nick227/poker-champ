import { Platform } from "react-native";

/** Animation timing. Use for transitions and micro-interactions. */
export const DURATION = {
  instant: 100,
  fast: 150,
  normal: 250,
  slow: 350,
} as const;

/** Pressable feedback opacity (pressed / disabled). */
export const PRESS_OPACITY = { pressed: 0.88, disabled: 0.6 } as const;

/** Native driver is unavailable on web (no RCTAnimation). */
export const USE_NATIVE_DRIVER = Platform.OS !== "web";
