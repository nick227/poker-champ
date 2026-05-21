/**
 * Central sound playback and policy gate.
 */
import { usePreferencesStore } from "@/stores/preferences.store";
import type { SoundDefinition, SoundKey } from "@/registry/sound.registry";
import { getSound } from "@/registry/sound.registry";

type SoundPlayer = {
  play: (key: SoundKey, def: SoundDefinition, finalVolume: number) => void | Promise<void>;
  preload?: (keys: SoundKey[]) => void | Promise<void>;
  disposeAll?: () => void | Promise<void>;
};

let player: SoundPlayer | null = null;
const lastPlayed = new Map<SoundKey, number>();

function clampVolume(v: number): number {
  if (Number.isNaN(v)) return 1;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function canPlayNow(key: SoundKey, now: number): boolean {
  const def = getSound(key);
  const cooldownMs = def.cooldownMs ?? 0;
  if (cooldownMs <= 0) return true;
  const last = lastPlayed.get(key);
  if (last == null || now - last >= cooldownMs) return true;
  return false;
}

export function setSoundPlayer(next: SoundPlayer): void {
  player = next;
}

/**
 * Transitional API: prefer emitSoundEvent(...) at feature boundaries.
 * Direct playSound(...) calls remain during migration.
 */
export function playSound(key: SoundKey): void {
  if (!usePreferencesStore.getState().soundEnabled) return;
  const now = Date.now();
  if (!canPlayNow(key, now)) return;
  const def = getSound(key);
  const masterVolume = usePreferencesStore.getState().masterVolume ?? 1;
  const finalVolume = clampVolume((def.volume ?? 1) * masterVolume);
  if (finalVolume <= 0) return;
  lastPlayed.set(key, now);
  if (player) void player.play(key, def, finalVolume);
}

function usePlaySound(): (key: SoundKey) => void {
  const { soundEnabled, masterVolume } = usePreferencesStore((s) => ({
    soundEnabled: s.soundEnabled,
    masterVolume: s.masterVolume,
  }));

  return (key: SoundKey) => {
    if (!soundEnabled) return;
    const now = Date.now();
    if (!canPlayNow(key, now)) return;
    const def = getSound(key);
    const finalVolume = clampVolume((def.volume ?? 1) * (masterVolume ?? 1));
    if (finalVolume <= 0) return;
    lastPlayed.set(key, now);
    if (player) void player.play(key, def, finalVolume);
  };
}

export function preloadSounds(keys: SoundKey[]): void {
  if (!player?.preload || keys.length === 0) return;
  void player.preload(keys);
}

function disposeSounds(): void {
  if (!player?.disposeAll) return;
  void player.disposeAll();
}
