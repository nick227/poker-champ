import { beforeEach, describe, expect, it, vi } from "vitest";
import { createExpoAvPlayer } from "@/lib/soundPlayer";

const { createdSounds, createAsyncMock } = vi.hoisted(() => {
  const sounds: Array<{
    replayAsync: ReturnType<typeof vi.fn>;
    setVolumeAsync: ReturnType<typeof vi.fn>;
    unloadAsync: ReturnType<typeof vi.fn>;
  }> = [];

  const createAsync = vi.fn(async () => {
    const sound = {
      replayAsync: vi.fn(async () => {}),
      setVolumeAsync: vi.fn(async () => {}),
      unloadAsync: vi.fn(async () => {}),
    };
    sounds.push(sound);
    return { sound };
  });

  return { createdSounds: sounds, createAsyncMock: createAsync };
});

vi.mock("expo-av", () => ({
  Audio: {
    setAudioModeAsync: vi.fn(async () => {}),
    Sound: {
      createAsync: createAsyncMock,
    },
  },
}));

vi.mock("@/registry/sound.registry", () => ({
  getSound: vi.fn(() => ({ asset: 1, category: "table", maxInstances: 2 })),
}));

describe("sound player polyphony", () => {
  beforeEach(() => {
    createdSounds.length = 0;
    createAsyncMock.mockClear();
    vi.clearAllMocks();
  });

  it("caps instance pool to maxInstances and reuses sounds", async () => {
    const player = createExpoAvPlayer();
    const def = { asset: 1, category: "table" as const, maxInstances: 2 };

    await player.play("cardDeal", def, 1);
    await player.play("cardDeal", def, 1);
    await player.play("cardDeal", def, 1);

    expect(createAsyncMock).toHaveBeenCalledTimes(2);
    const totalReplays = createdSounds.reduce((sum, s) => sum + s.replayAsync.mock.calls.length, 0);
    expect(totalReplays).toBe(3);
  });
});
