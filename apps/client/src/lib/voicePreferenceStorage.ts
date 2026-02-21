import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const VOICE_PREF_KEY = "voice_pref_v1";

export type VoicePreference = {
  enabled: boolean;
  muted: boolean;
};

const DEFAULT_PREF: VoicePreference = {
  enabled: false,
  muted: false,
};

export async function loadVoicePreference(): Promise<VoicePreference> {
  try {
    const raw =
      Platform.OS === "web"
        ? typeof globalThis.localStorage !== "undefined"
          ? globalThis.localStorage.getItem(VOICE_PREF_KEY)
          : null
        : await SecureStore.getItemAsync(VOICE_PREF_KEY);

    if (!raw) return DEFAULT_PREF;
    const parsed = JSON.parse(raw) as Partial<VoicePreference>;
    return {
      enabled: Boolean(parsed.enabled),
      muted: Boolean(parsed.muted),
    };
  } catch {
    return DEFAULT_PREF;
  }
}

export async function saveVoicePreference(pref: VoicePreference): Promise<void> {
  const payload = JSON.stringify({
    enabled: Boolean(pref.enabled),
    muted: Boolean(pref.muted),
  });

  if (Platform.OS === "web") {
    if (typeof globalThis.localStorage === "undefined") return;
    globalThis.localStorage.setItem(VOICE_PREF_KEY, payload);
    return;
  }
  await SecureStore.setItemAsync(VOICE_PREF_KEY, payload);
}

