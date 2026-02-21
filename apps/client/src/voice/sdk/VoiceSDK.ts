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
  private muted = false;
  private speaking = false;
  private onSpeakingChanged?: (speaking: boolean) => void;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaSource: MediaStreamAudioSourceNode | null = null;
  private speakingRaf: number | null = null;
  private speakingBuffer: Uint8Array<ArrayBuffer> | null = null;

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
    if (this.joined) return;

    this.local = new LocalAudioTrack();
    await this.local.start();
    this.startSpeakingMeter(this.local.getStreamOrThrow());

    this.pcm = new PeerConnectionManager({
      selfUserId: this.selfUserId,
      channelId: this.channelId,
      adapter: this.adapter,
      localStream: this.local.getStreamOrThrow(),
    });

    this.pcm.setPeers(this.peers);
    await this.pcm.beginNegotiation();

    this.joined = true;
  }

  /**
   * leave -> channel
   * Tears down all peer connections and stops mic.
   */
  async leaveChannel(): Promise<void> {
    if (!this.joined) return;

    await this.pcm?.dispose();
    await this.local?.stop();

    this.pcm = null;
    this.local = null;
    this.stopSpeakingMeter();
    this.setSpeaking(false);
    this.joined = false;
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
   * handle -> signal
   */
  private async handleSignal(msg: VoiceSignalMessage): Promise<void> {
    // Ignore mismatched channels
    if (msg.channelId !== this.channelId) return;
    if (msg.toUserId !== this.selfUserId) return;

    if (!this.pcm) {
      // If we haven't joined, ignore signals (future: auto-join)
      return;
    }

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

      this.analyser.getByteTimeDomainData(this.speakingBuffer);
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
    } catch {}
    try {
      this.analyser?.disconnect();
    } catch {}
    try {
      void this.audioContext?.close();
    } catch {}
    this.mediaSource = null;
    this.analyser = null;
    this.audioContext = null;
    this.speakingBuffer = null;
  }
}
