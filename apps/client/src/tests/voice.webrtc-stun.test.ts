/* global RTCConfiguration, FrameRequestCallback, MediaStream */
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

  type AdapterWithTestHelpers = VoiceSignalingAdapter & {
    sent: unknown[];
    deliverMessage: (msg: unknown) => void;
  };
  const adapterFactory = (): AdapterWithTestHelpers => {
    const sent: unknown[] = [];
    let messageHandler: ((msg: unknown) => void) | null = null;
    return {
      sent,
      send: (msg) => {
        sent.push(msg);
      },
      onMessage: (cb) => {
        messageHandler = cb as (msg: unknown) => void;
      },
      deliverMessage: (msg) => {
        messageHandler?.(msg);
      },
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

    expect(adapter.sent.some((msg: unknown) => (msg as { type?: string }).type === "VOICE_ICE")).toBe(true);
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

  it("dispose closes all peer connections and clears map", async () => {
    const adapter = adapterFactory();
    const pcm = new PeerConnectionManager({
      selfUserId: "user-a",
      channelId: "table-1",
      adapter,
      localStream: { getTracks: () => [] } as unknown as MediaStream,
    });

    pcm.setPeers(["user-b"]);
    await pcm.beginNegotiation();
    expect(createdPcs.length).toBe(1);

    await pcm.dispose();
    expect(createdPcs[0]?.close).toHaveBeenCalledTimes(1);
    createdPcs.length = 0;

    pcm.setPeers(["user-b", "user-c"]);
    await pcm.beginNegotiation();
    expect(createdPcs.length).toBe(2);
    await pcm.dispose();
    expect(createdPcs[0]?.close).toHaveBeenCalled();
    expect(createdPcs[1]?.close).toHaveBeenCalled();
  });

  it("leaveChannel stops local tracks and tears down PCM", async () => {
    const trackStop = vi.fn();
    const mockStream = {
      getTracks: () => [{ stop: trackStop }],
      getAudioTracks: () => [{ enabled: true, stop: trackStop }],
    };
    Object.defineProperty(globalThis.navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: vi.fn(async () => mockStream),
    });

    const adapter = adapterFactory();
    const sdk = new VoiceSDK({
      adapter,
      selfUserId: "user-a",
      channelId: "table-1",
    });
    sdk.setPeers(["user-b"]);

    await sdk.joinChannel();
    expect(createdPcs.length).toBe(1);

    await sdk.leaveChannel();
    expect(trackStop).toHaveBeenCalled();
    expect(createdPcs[0]?.close).toHaveBeenCalled();

    adapter.sent.length = 0;
    await sdk.joinChannel();
    expect(createdPcs.length).toBe(2);
    await sdk.leaveChannel();
    expect(createdPcs[1]?.close).toHaveBeenCalled();
  });

  it("ignores incoming signals for mismatched channelId", async () => {
    const adapter = adapterFactory();
    const sdk = new VoiceSDK({
      adapter,
      selfUserId: "user-a",
      channelId: "table-1",
    });

    await sdk.joinChannel();
    const before = adapter.sent.length;

    adapter.deliverMessage({
      type: "VOICE_OFFER",
      channelId: "other-table",
      fromUserId: "user-b",
      toUserId: "user-a",
      sdp: {},
    });

    expect(adapter.sent.length).toBe(before);
  });

  it("leaveChannel during join cleans up and does not create PCs", async () => {
    const trackStop = vi.fn();
    const mockStream = {
      getTracks: () => [{ stop: trackStop }],
      getAudioTracks: () => [{ enabled: true, stop: trackStop }],
    };
    let resolveGum: (v: unknown) => void = () => {};
    const gumPromise = new Promise<typeof mockStream>((r) => {
      resolveGum = r as (v: unknown) => void;
    });
    Object.defineProperty(globalThis.navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: () => gumPromise,
    });

    const adapter = adapterFactory();
    const sdk = new VoiceSDK({
      adapter,
      selfUserId: "user-a",
      channelId: "table-1",
    });
    sdk.setPeers(["user-b"]);

    const joinPromise = sdk.joinChannel();
    await sdk.leaveChannel();
    resolveGum(mockStream);
    await joinPromise.catch(() => {});

    expect(createdPcs.length).toBe(0);
    const state = sdk.getDebugState();
    expect(state.joined).toBe(false);
    expect(state.peerCount).toBe(0);
    expect(state.meterRunning).toBe(false);
  });

  it("disposed SDK ignores delivered signals", async () => {
    const adapter = adapterFactory();
    const sdk = new VoiceSDK({
      adapter,
      selfUserId: "user-a",
      channelId: "table-1",
    });
    sdk.setPeers(["user-b"]);
    await sdk.joinChannel();
    const sentAfterJoin = adapter.sent.length;

    sdk.dispose();
    await new Promise((r) => setTimeout(r, 0));

    adapter.deliverMessage({
      type: "VOICE_ANSWER",
      channelId: "table-1",
      fromUserId: "user-b",
      toUserId: "user-a",
      sdp: {},
    });

    expect(adapter.sent.length).toBe(sentAfterJoin);
    expect(sdk.getDebugState().joined).toBe(false);
  });

  it("late VOICE_SIGNAL after leave is ignored and does not resurrect PC", async () => {
    const trackStop = vi.fn();
    const mockStream = {
      getTracks: () => [{ stop: trackStop }],
      getAudioTracks: () => [{ enabled: true, stop: trackStop }],
    };
    Object.defineProperty(globalThis.navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: vi.fn(async () => mockStream),
    });

    const adapter = adapterFactory();
    const sdk = new VoiceSDK({
      adapter,
      selfUserId: "user-a",
      channelId: "table-1",
    });
    sdk.setPeers(["user-b"]);
    await sdk.joinChannel();
    const sentAfterJoin = adapter.sent.length;
    await sdk.leaveChannel();

    adapter.deliverMessage({
      type: "VOICE_ANSWER",
      channelId: "table-1",
      fromUserId: "user-b",
      toUserId: "user-a",
      sdp: {},
    });

    expect(adapter.sent.length).toBe(sentAfterJoin);
    expect(sdk.getDebugState().peerCount).toBe(0);
    expect(sdk.getDebugState().joined).toBe(false);
  });
});
