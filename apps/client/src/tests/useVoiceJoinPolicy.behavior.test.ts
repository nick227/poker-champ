import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useEffect: (effect: () => void | (() => void)) => {
      effect();
    },
    useCallback: <T extends (...args: any[]) => any>(fn: T) => fn,
  };
});

import { useVoiceJoinPolicy } from "@/components/domain/table/hooks/useVoiceJoinPolicy";

function createController() {
  return {
    isEnabled: vi.fn(() => false),
    setMuted: vi.fn(),
    join: vi.fn(async () => undefined),
    leave: vi.fn(async () => undefined),
    toggleEnabled: vi.fn(async () => true),
    toggleMute: vi.fn(() => true),
  };
}

describe("useVoiceJoinPolicy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("auto-joins and applies mute state when enabled, ready, and seated", async () => {
    const controller = createController();
    const controllerRef = { current: controller };
    const autoJoinAttemptedRef = { current: false };
    const setVoiceEnabled = vi.fn();
    const setVoiceMuted = vi.fn();
    const showVoiceError = vi.fn();

    useVoiceJoinPolicy({
      controllerRef,
      autoJoinAttemptedRef,
      voiceEnabled: true,
      setVoiceEnabled,
      voiceMuted: true,
      setVoiceMuted,
      voicePrefReady: true,
      heroIsSittingOut: false,
      voiceRoom: { send: () => {}, onMessage: () => {} },
      heroUserId: "hero-1",
      showVoiceError,
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(autoJoinAttemptedRef.current).toBe(true);
    expect(controller.join).toHaveBeenCalledTimes(1);
    expect(controller.setMuted).toHaveBeenCalledWith(true);
    expect(showVoiceError).not.toHaveBeenCalled();
    expect(setVoiceEnabled).not.toHaveBeenCalledWith(false);
  });

  it("leaves voice when hero sits out and controller is currently enabled", async () => {
    const controller = createController();
    controller.isEnabled.mockReturnValue(true);
    const controllerRef = { current: controller };
    const autoJoinAttemptedRef = { current: true };
    const setVoiceEnabled = vi.fn();
    const setVoiceMuted = vi.fn();
    const showVoiceError = vi.fn();

    useVoiceJoinPolicy({
      controllerRef,
      autoJoinAttemptedRef,
      voiceEnabled: true,
      setVoiceEnabled,
      voiceMuted: false,
      setVoiceMuted,
      voicePrefReady: true,
      heroIsSittingOut: true,
      voiceRoom: { send: () => {}, onMessage: () => {} },
      heroUserId: "hero-1",
      showVoiceError,
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(controller.leave).toHaveBeenCalledTimes(1);
    expect(setVoiceEnabled).toHaveBeenCalledWith(false);
    expect(setVoiceMuted).toHaveBeenCalledWith(false);
    expect(autoJoinAttemptedRef.current).toBe(false);
  });

  it("disables voice and calls showVoiceError when join rejects", async () => {
    const controller = createController();
    const joinError = new Error("NotAllowedError");
    controller.join.mockRejectedValueOnce(joinError);
    const controllerRef = { current: controller };
    const autoJoinAttemptedRef = { current: false };
    const setVoiceEnabled = vi.fn();
    const setVoiceMuted = vi.fn();
    const showVoiceError = vi.fn();

    useVoiceJoinPolicy({
      controllerRef,
      autoJoinAttemptedRef,
      voiceEnabled: true,
      setVoiceEnabled,
      voiceMuted: false,
      setVoiceMuted,
      voicePrefReady: true,
      heroIsSittingOut: false,
      voiceRoom: { send: () => {}, onMessage: () => {} },
      heroUserId: "hero-1",
      showVoiceError,
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(setVoiceEnabled).toHaveBeenCalledWith(false);
    expect(showVoiceError).toHaveBeenCalledWith(joinError);
  });
});
