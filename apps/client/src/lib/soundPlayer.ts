/**
 * expo-av sound player. Uses a single placeholder asset until per-key assets exist.
 * Caches one Sound instance and replays it for any key.
 */
import { Audio } from "expo-av";
import type { SoundKey } from "@/registry/sound.registry";

const PLACEHOLDER = require("../../assets/sounds/placeholder.mp3");

let cached: Audio.Sound | null = null;
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

async function getSound(): Promise<Audio.Sound> {
  await ensureMode();
  if (cached) return cached;
  const { sound } = await Audio.Sound.createAsync(PLACEHOLDER);
  cached = sound;
  return sound;
}

export function createExpoAvPlayer(): (
  key: SoundKey,
  _source: string
) => void | Promise<void> {
  return async (key: SoundKey, _source: string) => {
    try {
      const sound = await getSound();
      await sound.replayAsync();
    } catch {
      // no-op on missing/failed asset
    }
  };
}
