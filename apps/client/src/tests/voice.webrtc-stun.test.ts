import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PeerConnectionManager } from "@/voice/sdk/PeerConnectionManager";
import { VoiceSDK } from "@/voice/sdk/VoiceSDK";
import type { VoiceSignalingAdapter } from "@/voice/sdk/types";

type MockPcInstance = {
  signalingState: "stable" | "have-local-offer" | "have-remote-offer";
  addTrack: ReturnType<typeof vi.fn>;
  createOffer: ReturnType<typeof vi.fn>;
  setLocalDescription: ReturnType<typeof vi.fn>;
  createAnswer: ReturnType<typeof vi.fn>;
  setRemoteDescription: ReturnType<typeof vi.fn>;
  addIceCandidate: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  onicecandidate: ((evt: { candidate?: { toJSON?: () => unknown } | unknown }) => void) | null;
  ontrack: ((evt: unknown) => void) | null;
};

describe("voice webrtc + stun flows", () => {
  const createdPcConfigs: RTCConfiguration[] = [];
  const createdPcs: MockPcInstance[] = [];
  let audioContextSuspend = vi.fn();
  let audioContextResume = vi.fn();
  let audioContextClose = vi.fn();
  let currentAudioState: "running" | "suspended" = "running";
  let rafCb: FrameRequestCallback | null = null;
  let analyzerMode: "loud" | "quiet" = "quiet";

  const adapterFactory = (): VoiceSignalingAdapter & { sent: unknown[] } => {
    const sent: unknown[] = [];
    return {
      sent,
      send: (msg) => {
        sent.push(msg);
      },
      onMessage: () => undefined,
    };
  };

  beforeEach(() => {
    createdPcConfigs.length = 0;
    createdPcs.length = 0;
    audioContextSuspend = vi.fn(async () => {
      currentAudioState = "suspended";
    });
    audioContextResume = vi.fn(async () => {
      currentAudioState = "running";
    });
    audioContextClose = vi.fn(async () => undefined);
    currentAudioState = "running";
    analyzerMode = "quiet";
    rafCb = null;

    class MockRTCPeerConnection {
      signalingState: "stable" | "have-local-offer" | "have-remote-offer" = "stable";
      onicecandidate: ((evt: { candidate?: { toJSON?: () => unknown } | unknown }) => void) | null = null;
      ontrack: ((evt: unknown) => void) | null = null;
      addTrack = vi.fn();
      createOffer = vi.fn(async () => ({ type: "offer", sdp: "mock-offer" }));
      setLocalDescription = vi.fn(async () => undefined);
      createAnswer = vi.fn(async () => ({ type: "answer", sdp: "mock-answer" }));
      setRemoteDescription = vi.fn(async () => undefined);
      addIceCandidate = vi.fn(async () => undefined);
      close = vi.fn();

      constructor(config: RTCConfiguration) {
        createdPcConfigs.push(config);
        createdPcs.push(this as unknown as MockPcInstance);
      }
    }

    class MockAudioContext {
      state: "running" | "suspended" = currentAudioState;
      createAnalyser() {
        return {
          fftSize: 1024,
          smoothingTimeConstant: 0,
          getByteTimeDomainData: (buffer: Uint8Array) => {
            if (analyzerMode === "loud") {
              for (let i = 0; i < buffer.length; i += 1) {
                buffer[i] = i % 2 === 0 ? 200 : 56;
              }
              return;
            }
            buffer.fill(128);
          },
          disconnect: vi.fn(),
        };
      }
      createMediaStreamSource() {
        return { connect: vi.fn(), disconnect: vi.fn() };
      }
      suspend = vi.fn(async () => {
        audioContextSuspend();
        this.state = "suspended";
      });
      resume = vi.fn(async () => {
        audioContextResume();
        this.state = "running";
      });
      close = audioContextClose;
    }

    Object.defineProperty(globalThis, "RTCPeerConnection", {
      configurable: true,
      value: MockRTCPeerConnection,
    });
    Object.defineProperty(globalThis, "AudioContext", {
      configurable: true,
      value: MockAudioContext,
    });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        mediaDevices: {
          getUserMedia: vi.fn(async () => ({
            getTracks: () => [],
            getAudioTracks: () => [{ enabled: true }],
          })),
        },
      },
    });
    Object.defineProperty(globalThis, "requestAnimationFrame", {
      configurable: true,
      value: vi.fn((cb: FrameRequestCallback) => {
        rafCb = cb;
        return 1;
      }),
    });
    Object.defineProperty(globalThis, "cancelAnimationFrame", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("applies STUN ICE config when creating peer connections", async () => {
    const adapter = adapterFactory();
    const pcm = new PeerConnectionManager({
      selfUserId: "user-a",
      channelId: "table-1",
      adapter,
      localStream: { getTracks: () => [] } as unknown as MediaStream,
    });

    pcm.setPeers(["user-b"]);
    await pcm.beginNegotiation();

    expect(createdPcConfigs.length).toBe(1);
    expect(createdPcConfigs[0]?.iceServers?.[0]).toEqual({ urls: "stun:stun.l.google.com:19302" });
  });

  it("emits VOICE_ICE signal when ICE candidate is produced", async () => {
    const adapter = adapterFactory();
    const pcm = new PeerConnectionManager({
      selfUserId: "user-a",
      channelId: "table-1",
      adapter,
      localStream: { getTracks: () => [] } as unknown as MediaStream,
    });

    pcm.setPeers(["user-b"]);
    await pcm.beginNegotiation();
    const pc = createdPcs[0];
    expect(pc).toBeTruthy();

    pc.onicecandidate?.({
      candidate: {
        toJSON: () => ({ candidate: "candidate:1 1 udp 1 127.0.0.1 9999 typ host" }),
      },
    });

    expect(adapter.sent.some((msg: any) => msg.type === "VOICE_ICE")).toBe(true);
  });

  it("suspends and resumes audio context on mute and unmute", async () => {
    const adapter = adapterFactory();
    const sdk = new VoiceSDK({
      adapter,
      selfUserId: "user-a",
      channelId: "table-1",
    });

    await sdk.joinChannel();
    expect(rafCb).toBeTruthy();

    sdk.setMuted(true);
    expect(audioContextSuspend).toHaveBeenCalledTimes(1);

    sdk.setMuted(false);
    expect(audioContextResume).toHaveBeenCalledTimes(1);
  });
});
