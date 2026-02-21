/**
 * expo-av sound player with per-key pooled instances.
 * Failures are non-blocking and logged once in development.
 */
import { Audio } from "expo-av";
import type { SoundDefinition, SoundKey } from "@/registry/sound.registry";
import { getSound } from "@/registry/sound.registry";

const pools = new Map<SoundKey, Audio.Sound[]>();
const cursor = new Map<SoundKey, number>();
const logOnceKeys = new Set<string>();
let modeSet = false;

async function ensureMode(): Promise<void> {
  if (modeSet) return;
  await Audio.setAudioModeAsync({
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
  });
  modeSet = true;
}

function shouldLogInDev(key: string): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (logOnceKeys.has(key)) return false;
  logOnceKeys.add(key);
  return true;
}

function clampVolume(v: number): number {
  if (Number.isNaN(v)) return 1;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

async function createSound(asset: number): Promise<Audio.Sound> {
  await ensureMode();
  const { sound } = await Audio.Sound.createAsync(asset);
  return sound;
}

async function ensurePoolSize(key: SoundKey, def: SoundDefinition, target: number): Promise<Audio.Sound[]> {
  const nextTarget = Math.max(1, target);
  const current = pools.get(key) ?? [];
  if (!pools.has(key)) pools.set(key, current);
  while (current.length < nextTarget) {
    current.push(await createSound(def.asset));
  }
  return current;
}

function getInstanceIndex(key: SoundKey, poolSize: number): number {
  const current = cursor.get(key) ?? 0;
  const idx = current % poolSize;
  cursor.set(key, current + 1);
  return idx;
}

async function playWithPool(key: SoundKey, def: SoundDefinition, volume: number): Promise<void> {
  const maxInstances = Math.max(1, def.maxInstances ?? 1);
  const pool = await ensurePoolSize(key, def, maxInstances);
  const idx = getInstanceIndex(key, pool.length);
  const sound = pool[idx];
  await sound.setVolumeAsync(clampVolume(volume));
  await sound.replayAsync();
}

async function preload(keys: SoundKey[]): Promise<void> {
  for (const key of keys) {
    const def = getSound(key);
    await ensurePoolSize(key, def, 1);
  }
}

async function disposeAll(): Promise<void> {
  for (const [, pool] of pools) {
    for (const sound of pool) {
      try {
        await sound.unloadAsync();
      } catch {
        // no-op
      }
    }
  }
  pools.clear();
  cursor.clear();
  modeSet = false;
}

export function createExpoAvPlayer(): {
  play: (key: SoundKey, def: SoundDefinition, volume: number) => void | Promise<void>;
  preload: (keys: SoundKey[]) => void | Promise<void>;
  disposeAll: () => void | Promise<void>;
} {
  return {
    play: async (key: SoundKey, def: SoundDefinition, volume: number) => {
      try {
        await playWithPool(key, def, volume);
      } catch (error) {
        if (shouldLogInDev(`play:${key}`)) {
          // eslint-disable-next-line no-console
          console.warn(`[sound] play failed for "${key}"`, error);
        }
      }
    },
    preload: async (keys: SoundKey[]) => {
      try {
        await preload(keys);
      } catch (error) {
        if (shouldLogInDev("preload")) {
          // eslint-disable-next-line no-console
          console.warn("[sound] preload failed", error);
        }
      }
    },
    disposeAll: async () => {
      try {
        await disposeAll();
      } catch (error) {
        if (shouldLogInDev("disposeAll")) {
          // eslint-disable-next-line no-console
          console.warn("[sound] dispose failed", error);
        }
      }
    },
  };
}
