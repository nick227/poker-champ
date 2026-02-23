/* global AudioContext, AnalyserNode, MediaStream, MediaStreamAudioSourceNode */
import type { VoiceSignalMessage } from "../contracts/voice-signals";
import type { VoiceSignalingAdapter } from "./types";
import { PeerConnectionManager } from "./PeerConnectionManager";
import { LocalAudioTrack } from "./LocalAudioTrack";

/**
 * VoiceSDK (v0.1)
 * - Owns WebRTC lifecycle.
 * - Uses an adapter for signaling transport.
 * - Engine-agnostic: only knows channelId + userIds.
 *
 * Dev experience goals:
 * - Small API
 * - Declarative inputs (setPeers)
 * - Predictable naming
 */
export class VoiceSDK {
  private readonly adapter: VoiceSignalingAdapter;
  private readonly selfUserId: string;
  private channelId: string;

  private peers: string[] = [];
  private local: LocalAudioTrack | null = null;
  private pcm: PeerConnectionManager | null = null;

  private joined = false;
  private joining = false;
  private disposed = false;
  private muted = false;
  private speaking = false;
  private onSpeakingChanged?: (speaking: boolean) => void;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaSource: MediaStreamAudioSourceNode | null = null;
  private speakingRaf: number | null = null;
  private speakingBuffer: Uint8Array | null = null;

  constructor(params: {
    adapter: VoiceSignalingAdapter;
    selfUserId: string;
    channelId: string;
  }) {
    this.adapter = params.adapter;
    this.selfUserId = params.selfUserId;
    this.channelId = params.channelId;

    this.adapter.onMessage((msg) => this.handleSignal(msg));
  }

  setChannel(channelId: string) {
    this.channelId = channelId;
  }

  /**
   * set -> peers
   * v0.1: the app provides the peer list (from snapshot).
   */
  setPeers(peerUserIds: string[]) {
    const nextPeers = [...new Set(peerUserIds)].filter((id) => id && id !== this.selfUserId).sort();
    const currentPeers = [...this.peers].sort();
    if (nextPeers.length === currentPeers.length && nextPeers.every((id, i) => id === currentPeers[i])) {
      return;
    }

    this.peers = nextPeers;
    if (this.joined && this.pcm) {
      this.pcm.setPeers(this.peers);
      void this.pcm.beginNegotiation();
    }
  }

  /**
   * join -> channel
   * Starts mic and begins offers (deterministic initiator rule).
   */
  async joinChannel(): Promise<void> {
    if (this.joined || this.joining) return;
    this.joining = true;

    try {
      this.local = new LocalAudioTrack();
      await this.local.start();
      if (!this.joining) {
        await this.safeTeardown();
        return;
      }
      this.startSpeakingMeter(this.local.getStreamOrThrow());

      this.pcm = new PeerConnectionManager({
        selfUserId: this.selfUserId,
        channelId: this.channelId,
        adapter: this.adapter,
        localStream: this.local.getStreamOrThrow(),
      });

      this.pcm.setPeers(this.peers);
      await this.pcm.beginNegotiation();
      if (!this.joining) {
        await this.safeTeardown();
        return;
      }
      this.joined = true;
    } catch (e) {
      await this.safeTeardown();
      throw e;
    } finally {
      this.joining = false;
    }
  }

  /**
   * leave -> channel
   * Tears down all peer connections and stops mic. Safe to call during join.
   */
  async leaveChannel(): Promise<void> {
    if (!this.joined && !this.joining) return;
    await this.safeTeardown();
  }

  private async safeTeardown(): Promise<void> {
    try {
      await this.pcm?.dispose();
    } catch (_e) {
      if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
        console.warn("[VoiceSDK] pcm.dispose error", _e);
      }
    }
    try {
      await this.local?.stop();
    } catch (_e) {
      if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
        console.warn("[VoiceSDK] local.stop error", _e);
      }
    }
    this.pcm = null;
    this.local = null;
    this.stopSpeakingMeter();
    this.setSpeaking(false);
    this.joined = false;
    this.joining = false;
  }

  /**
   * Mark SDK disposed so handleSignal no-ops. Call leaveChannel (or dispose) from lifecycle.
   */
  dispose(): void {
    this.disposed = true;
    void this.leaveChannel();
  }

  /**
   * set -> muted
   * Local-only mute for v0.1 (track.enabled).
   */
  setMuted(muted: boolean) {
    this.muted = muted;
    this.local?.setMuted(muted);
    if (muted) {
      this.setSpeaking(false);
      if (this.audioContext?.state === "running") {
        void this.audioContext.suspend().catch(() => undefined);
      }
      return;
    }
    if (this.audioContext?.state === "suspended") {
      void this.audioContext.resume().catch(() => undefined);
    }
  }

  setOnSpeakingChanged(cb?: (speaking: boolean) => void) {
    this.onSpeakingChanged = cb;
    cb?.(this.speaking);
  }

  isSpeaking(): boolean {
    return this.speaking;
  }

  /**
   * Dev-only: snapshot for leak checks (localTracks, peerCount, meterRunning).
   */
  getDebugState(): {
    joined: boolean;
    muted: boolean;
    localTracks: { kind: string; readyState: string }[];
    peerCount: number;
    meterRunning: boolean;
  } {
    let localTracks: { kind: string; readyState: string }[] = [];
    if (this.local) {
      try {
        const stream = this.local.getStreamOrThrow();
        localTracks = stream.getTracks().map((t) => ({ kind: t.kind, readyState: t.readyState }));
      } catch {
        // no stream
      }
    }
    return Object.freeze({
      joined: this.joined,
      muted: this.muted,
      localTracks,
      peerCount: this.pcm?.getDebugPeerCount?.() ?? 0,
      meterRunning: this.speakingRaf != null,
    });
  }

  /**
   * handle -> signal
   */
  private async handleSignal(msg: VoiceSignalMessage): Promise<void> {
    if (this.disposed) return;
    if (msg.channelId !== this.channelId) return;
    if (msg.toUserId !== this.selfUserId) return;
    if (!this.pcm) return;

    await this.pcm.handleSignal(msg);
  }

  private setSpeaking(speaking: boolean) {
    if (this.speaking === speaking) return;
    this.speaking = speaking;
    this.onSpeakingChanged?.(speaking);
  }

  private startSpeakingMeter(stream: MediaStream) {
    const Ctx = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
      .AudioContext ??
      (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (typeof requestAnimationFrame !== "function") return;

    this.stopSpeakingMeter();

    const ctx = new Ctx();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.8;
    const mediaSource = ctx.createMediaStreamSource(stream);
    mediaSource.connect(analyser);

    this.audioContext = ctx;
    this.analyser = analyser;
    this.mediaSource = mediaSource;
    this.speakingBuffer = new Uint8Array(new ArrayBuffer(analyser.fftSize));
    if (this.muted) {
      void this.audioContext.suspend().catch(() => undefined);
    }

    const speakOnThreshold = 0.045;
    const speakOffThreshold = 0.03;

    const tick = () => {
      if (!this.analyser || !this.speakingBuffer) return;
      if (this.muted) {
        this.speakingRaf = requestAnimationFrame(tick);
        return;
      }

      this.analyser.getByteTimeDomainData(this.speakingBuffer as Uint8Array<ArrayBuffer>);
      let sum = 0;
      for (let i = 0; i < this.speakingBuffer.length; i += 1) {
        const centered = (this.speakingBuffer[i] - 128) / 128;
        sum += centered * centered;
      }
      const rms = Math.sqrt(sum / this.speakingBuffer.length);
      if (!this.speaking && rms >= speakOnThreshold) {
        this.setSpeaking(true);
      } else if (this.speaking && rms <= speakOffThreshold) {
        this.setSpeaking(false);
      }

      this.speakingRaf = requestAnimationFrame(tick);
    };

    this.speakingRaf = requestAnimationFrame(tick);
  }

  private stopSpeakingMeter() {
    if (this.speakingRaf != null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(this.speakingRaf);
      this.speakingRaf = null;
    }
    try {
      this.mediaSource?.disconnect();
    } catch (e) {
      if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
        console.warn("[VoiceSDK] stopSpeakingMeter mediaSource.disconnect", e);
      }
    }
    try {
      this.analyser?.disconnect();
    } catch (e) {
      if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
        console.warn("[VoiceSDK] stopSpeakingMeter analyser.disconnect", e);
      }
    }
    try {
      void this.audioContext?.close();
    } catch (e) {
      if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
        console.warn("[VoiceSDK] stopSpeakingMeter audioContext.close", e);
      }
    }
    this.mediaSource = null;
    this.analyser = null;
    this.audioContext = null;
    this.speakingBuffer = null;
  }
}
