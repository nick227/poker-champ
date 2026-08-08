import { beforeEach, describe, expect, it } from "vitest";
import { createMMKV, __resetMockMMKVForTests } from "@/__mocks__/react-native-mmkv";
import { usePreferencesStore } from "@/stores/preferences.store";

describe("haptics preference", () => {
  beforeEach(() => {
    __resetMockMMKVForTests();
  });

  it("defaults to enabled", () => {
    expect(usePreferencesStore.getState().hapticsEnabled).toBe(true);
  });

  it("toggles independently of the sound preference", () => {
    usePreferencesStore.getState().setHapticsEnabled(false);
    expect(usePreferencesStore.getState().hapticsEnabled).toBe(false);
    expect(usePreferencesStore.getState().soundEnabled).toBe(true);

    usePreferencesStore.getState().setSoundEnabled(false);
    expect(usePreferencesStore.getState().hapticsEnabled).toBe(false);
    expect(usePreferencesStore.getState().soundEnabled).toBe(false);

    // Restore for any state shared across tests in this module.
    usePreferencesStore.getState().setHapticsEnabled(true);
    usePreferencesStore.getState().setSoundEnabled(true);
  });

  it("persists the preference through the same storage the sound toggle uses", async () => {
    const storage = createMMKV({ id: "poker-champ-storage" });

    usePreferencesStore.getState().setHapticsEnabled(false);

    // The zustand persist middleware writes asynchronously (subscribe callback);
    // flush microtasks so the write lands before we assert.
    await Promise.resolve();
    await Promise.resolve();

    expect(storage.set).toHaveBeenCalled();
    const [, lastWrittenValue] = storage.set.mock.calls.at(-1) as [string, string];
    expect(JSON.parse(lastWrittenValue).state.hapticsEnabled).toBe(false);

    usePreferencesStore.getState().setHapticsEnabled(true);
  });
});
