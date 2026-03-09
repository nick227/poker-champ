import { beforeEach, describe, expect, it, vi } from "vitest";
import { playSound, setSoundPlayer } from "@/lib/sound";

type PrefState = {
  soundEnabled: boolean;
  masterVolume: number;
};

const prefs: PrefState = {
  soundEnabled: true,
  masterVolume: 1,
};

vi.mock("@/stores/preferences.store", () => {
  const usePreferencesStore = ((selector?: (s: PrefState) => unknown) =>
    selector ? selector(prefs) : prefs) as unknown as {
    (selector?: (s: PrefState) => unknown): unknown;
    getState: () => PrefState;
  };
  usePreferencesStore.getState = () => prefs;
  return { usePreferencesStore };
});

vi.mock("@/registry/sound.registry", () => {
  const defs = {
    tap: { asset: 1, category: "ui", cooldownMs: 100, volume: 1, maxInstances: 1 },
    bet: { asset: 1, category: "action", cooldownMs: 0, volume: 1, maxInstances: 1 },
  } as const;
  return {
    getSound: (key: keyof typeof defs) => defs[key],
  };
});

describe("sound policy layer", () => {
  let playSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    prefs.soundEnabled = true;
    prefs.masterVolume = 1;
    playSpy = vi.fn();
    setSoundPlayer({ play: playSpy });
  });

  it("skips repeated plays within cooldown window", () => {
    const now = vi.spyOn(Date, "now");
    now.mockReturnValueOnce(1000);
    playSound("tap");
    now.mockReturnValueOnce(1050);
    playSound("tap");
    now.mockReturnValueOnce(1201);
    playSound("tap");

    expect(playSpy).toHaveBeenCalledTimes(2);
  });

  it("does not call player when master volume is zero", () => {
    prefs.masterVolume = 0;
    playSound("bet");
    expect(playSpy).not.toHaveBeenCalled();
  });
});
