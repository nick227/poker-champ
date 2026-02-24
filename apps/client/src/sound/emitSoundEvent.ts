import { playSound } from "@/lib/sound";
import { SOUND_EVENT_MAP } from "./soundEventMap";
import { SOUND_EVENT_COOLDOWN_MS, type SoundEvent } from "./soundEvents";
export type { SoundEvent } from "./soundEvents";

const lastEmitted = new Map<SoundEvent, number>();
export type SoundEventMeta = {
  tableId?: string;
  handId?: string;
  urgent?: boolean;
};

function canEmit(event: SoundEvent, now: number): boolean {
  const cooldownMs = SOUND_EVENT_COOLDOWN_MS[event] ?? 0;
  if (cooldownMs <= 0) return true;
  const last = lastEmitted.get(event);
  if (last == null || now - last >= cooldownMs) return true;
  return false;
}

export function emitSoundEvent(event: SoundEvent, meta?: SoundEventMeta): void {
  // Reserved for future routing/telemetry without changing call sites.
  void meta;
  const now = Date.now();
  if (!canEmit(event, now)) return;
  const key = SOUND_EVENT_MAP[event];
  if (key == null) {
    throw new Error(`[sound] Unmapped SoundEvent: ${String(event)}`);
  }
  lastEmitted.set(event, now);
  playSound(key);
}

export function __resetSoundEventStateForTests(): void {
  lastEmitted.clear();
}
