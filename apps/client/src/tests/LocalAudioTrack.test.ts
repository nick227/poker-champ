import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalAudioTrack } from "@/voice/sdk/LocalAudioTrack";

describe("LocalAudioTrack", () => {
  let mockTrackStop: ReturnType<typeof vi.fn>;
  let getUserMedia: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockTrackStop = vi.fn();
    getUserMedia = vi.fn(async () => ({
      getTracks: () => [{ stop: mockTrackStop }],
      getAudioTracks: () => [{ enabled: true, stop: mockTrackStop }],
    }));
    Object.defineProperty(globalThis.navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("start acquires stream and stop stops all tracks", async () => {
    const track = new LocalAudioTrack();
    await track.start();
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: false });

    await track.stop();
    expect(mockTrackStop).toHaveBeenCalledTimes(1);
  });

  it("stop is no-op when stream not started", async () => {
    const track = new LocalAudioTrack();
    await track.stop();
    expect(mockTrackStop).not.toHaveBeenCalled();
  });

  it("setMuted toggles track enabled", async () => {
    const mockTrack = { enabled: true, stop: vi.fn() };
    getUserMedia = vi.fn(async () => ({
      getTracks: () => [mockTrack],
      getAudioTracks: () => [mockTrack],
    }));
    (globalThis.navigator as unknown as { mediaDevices: { getUserMedia: typeof getUserMedia } }).mediaDevices.getUserMedia = getUserMedia;

    const track = new LocalAudioTrack();
    await track.start();
    track.setMuted(true);
    expect(mockTrack.enabled).toBe(false);
    track.setMuted(false);
    expect(mockTrack.enabled).toBe(true);
  });

  it("throws MIC_PERMISSION_DENIED for NotAllowedError", async () => {
    getUserMedia = vi.fn(async () => {
      const err = new Error("denied") as Error & { name?: string };
      err.name = "NotAllowedError";
      throw err;
    });
    (globalThis.navigator as unknown as { mediaDevices: { getUserMedia: typeof getUserMedia } }).mediaDevices.getUserMedia = getUserMedia;

    const track = new LocalAudioTrack();
    await expect(track.start()).rejects.toMatchObject({ message: "MIC_PERMISSION_DENIED" });
  });

  it("throws MIC_PERMISSION_DENIED for SecurityError", async () => {
    getUserMedia = vi.fn(async () => {
      const err = new Error("security") as Error & { name?: string };
      err.name = "SecurityError";
      throw err;
    });
    (globalThis.navigator as unknown as { mediaDevices: { getUserMedia: typeof getUserMedia } }).mediaDevices.getUserMedia = getUserMedia;

    const track = new LocalAudioTrack();
    await expect(track.start()).rejects.toMatchObject({ message: "MIC_PERMISSION_DENIED" });
  });

  it("getStreamOrThrow throws when not started", () => {
    const track = new LocalAudioTrack();
    expect(() => track.getStreamOrThrow()).toThrow("stream not started");
  });
});
