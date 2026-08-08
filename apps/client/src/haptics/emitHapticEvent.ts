import { triggerHaptic } from "@/lib/haptics";
import { HAPTIC_EVENT_MAP } from "./hapticEventMap";
import { HAPTIC_EVENT_COOLDOWN_MS, type HapticEvent } from "./hapticEvents";
export type { HapticEvent } from "./hapticEvents";

const lastEmitted = new Map<HapticEvent, number>();

function canEmit(event: HapticEvent, now: number): boolean {
  const cooldownMs = HAPTIC_EVENT_COOLDOWN_MS[event] ?? 0;
  if (cooldownMs <= 0) return true;
  const last = lastEmitted.get(event);
  if (last == null || now - last >= cooldownMs) return true;
  return false;
}

export function emitHapticEvent(event: HapticEvent): void {
  const now = Date.now();
  if (!canEmit(event, now)) return;
  const pattern = HAPTIC_EVENT_MAP[event];
  if (pattern == null) {
    throw new Error(`[haptics] Unmapped HapticEvent: ${String(event)}`);
  }
  lastEmitted.set(event, now);
  triggerHaptic(pattern);
}

export function __resetHapticEventStateForTests(): void {
  lastEmitted.clear();
}
