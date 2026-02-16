/**
 * Central sound playback. Respects preferences.soundEnabled.
 * Wire to expo-av (or other player) by implementing playSoundImpl.
 */
import { usePreferencesStore } from "@/stores/preferences.store";
import type { SoundKey } from "@/registry/sound.registry";
import { getSound } from "@/registry/sound.registry";

/** Override with actual playback (e.g. expo-av). Called only when soundEnabled is true. */
let playSoundImpl: ((key: SoundKey, source: string) => void | Promise<void>) | null = null;

export function setSoundPlayer(fn: (key: SoundKey, source: string) => void | Promise<void>): void {
  playSoundImpl = fn;
}

export function playSound(key: SoundKey): void {
  if (!usePreferencesStore.getState().soundEnabled) return;
  const def = getSound(key);
  if (playSoundImpl) playSoundImpl(key, def.source);
}

export function usePlaySound(): (key: SoundKey) => void {
  const soundEnabled = usePreferencesStore((s) => s.soundEnabled);
  return (key: SoundKey) => {
    if (!soundEnabled) return;
    const def = getSound(key);
    if (playSoundImpl) playSoundImpl(key, def.source);
  };
}
