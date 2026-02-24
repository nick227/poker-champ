import { beforeEach, describe, expect, it, vi } from "vitest";
import { __resetSoundEventStateForTests, emitSoundEvent } from "@/sound/emitSoundEvent";

const playSound = vi.fn();

vi.mock("@/lib/sound", () => ({
  playSound: (key: unknown) => playSound(key),
}));

describe("sound event router", () => {
  beforeEach(() => {
    __resetSoundEventStateForTests();
    playSound.mockClear();
    vi.restoreAllMocks();
  });

  it("maps semantic events to sound keys", () => {
    emitSoundEvent("table.action.bet");
    expect(playSound).toHaveBeenCalledWith("bet");
    expect(playSound).toHaveBeenCalledTimes(1);
  });

  it("enforces cooldown per event, not just per key", () => {
    const now = vi.spyOn(Date, "now");
    now.mockReturnValueOnce(1000);
    emitSoundEvent("table.handStart");
    now.mockReturnValueOnce(1050);
    emitSoundEvent("table.boardReveal");
    now.mockReturnValueOnce(1080);
    emitSoundEvent("table.boardReveal");
    now.mockReturnValueOnce(1115);
    emitSoundEvent("table.boardReveal");

    expect(playSound).toHaveBeenNthCalledWith(1, "cardDeal");
    expect(playSound).toHaveBeenNthCalledWith(2, "cardDeal");
    expect(playSound).toHaveBeenNthCalledWith(3, "cardDeal");
    expect(playSound).toHaveBeenCalledTimes(3);
  });

  it("throws when an unmapped event is emitted", () => {
    expect(() => emitSoundEvent("sound.missing" as unknown as Parameters<typeof emitSoundEvent>[0])).toThrow(
      "[sound] Unmapped SoundEvent",
    );
  });
});
