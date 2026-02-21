/* global MediaStream */
/**
 * LocalAudioTrack (v0.1)
 * Web-first implementation using navigator.mediaDevices.
 *
 * NOTE: If your client is React Native, replace internals with react-native-webrtc.
 * Keep the class and method names stable so the rest of the SDK doesn't change.
 */
export class LocalAudioTrack {
  private stream: MediaStream | null = null;
  private muted = false;

  async start(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      this.applyMute();
    } catch (err) {
      const name = (err as { name?: string } | null)?.name;
      if (name === "NotAllowedError" || name === "SecurityError") {
        throw new Error("MIC_PERMISSION_DENIED", { cause: err });
      }
      throw err instanceof Error ? err : new Error("MIC_INIT_FAILED", { cause: err });
    }
  }

  async stop(): Promise<void> {
    if (!this.stream) return;
    for (const t of this.stream.getTracks()) t.stop();
    this.stream = null;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.applyMute();
  }

  private applyMute() {
    if (!this.stream) return;
    for (const t of this.stream.getAudioTracks()) {
      t.enabled = !this.muted;
    }
  }

  getStreamOrThrow(): MediaStream {
    if (!this.stream) throw new Error("LocalAudioTrack: stream not started");
    return this.stream;
  }
}
