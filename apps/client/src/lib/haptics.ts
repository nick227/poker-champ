/**
 * Central haptic playback and policy gate. Mirrors `@/lib/sound.ts`:
 * a preference check, a cooldown, then a platform call — with every failure
 * mode swallowed so a missing/unsupported haptics engine (web, simulators,
 * some Android devices) is a silent no-op rather than a crash.
 */
import * as Haptics from "expo-haptics";
import { usePreferencesStore } from "@/stores/preferences.store";
import type { HapticPattern } from "@/haptics/hapticEventMap";

const NOTIFICATION_TYPE: Record<"Success" | "Warning" | "Error", Haptics.NotificationFeedbackType> = {
  Success: Haptics.NotificationFeedbackType.Success,
  Warning: Haptics.NotificationFeedbackType.Warning,
  Error: Haptics.NotificationFeedbackType.Error,
};

const IMPACT_STYLE: Record<"Light" | "Medium" | "Heavy", Haptics.ImpactFeedbackStyle> = {
  Light: Haptics.ImpactFeedbackStyle.Light,
  Medium: Haptics.ImpactFeedbackStyle.Medium,
  Heavy: Haptics.ImpactFeedbackStyle.Heavy,
};

/** Cheap, stable key per pattern shape — used for the pattern-level cooldown below. */
function patternKey(pattern: HapticPattern): string {
  switch (pattern.kind) {
    case "impact":
      return `impact:${pattern.style}`;
    case "notification":
      return `notification:${pattern.type}`;
    case "selection":
      return "selection";
  }
}

/**
 * Safety-net cooldown per physical pattern, independent of the per-event
 * cooldown in `@/haptics/emitHapticEvent`. Protects against two *different*
 * events that happen to share a pattern (e.g. two Light impacts) firing back
 * to back, the same way SoundKey.cooldownMs backstops SoundEvent cooldowns.
 */
const PATTERN_COOLDOWN_MS = 60;
const lastFired = new Map<string, number>();

function canFireNow(key: string, now: number): boolean {
  const last = lastFired.get(key);
  if (last == null || now - last >= PATTERN_COOLDOWN_MS) return true;
  return false;
}

async function dispatch(pattern: HapticPattern): Promise<void> {
  switch (pattern.kind) {
    case "impact":
      await Haptics.impactAsync(IMPACT_STYLE[pattern.style]);
      return;
    case "notification":
      await Haptics.notificationAsync(NOTIFICATION_TYPE[pattern.type]);
      return;
    case "selection":
      await Haptics.selectionAsync();
      return;
  }
}

/**
 * Transitional API: prefer emitHapticEvent(...) at feature boundaries.
 * Fires a physical haptic pattern, gated by the user's preference and a
 * short pattern-level cooldown. Never throws — unsupported platforms (web)
 * and unavailable native modules resolve to a no-op.
 */
export function triggerHaptic(pattern: HapticPattern): void {
  if (!usePreferencesStore.getState().hapticsEnabled) return;
  const now = Date.now();
  const key = patternKey(pattern);
  if (!canFireNow(key, now)) return;
  lastFired.set(key, now);
  void dispatch(pattern).catch(() => {
    // Unsupported/unavailable haptics engine (web, some simulators): no-op.
  });
}

export function __resetHapticPolicyStateForTests(): void {
  lastFired.clear();
}
