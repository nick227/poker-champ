/* global MediaStream, RTCPeerConnection, RTCConfiguration */
import type { VoiceSignalMessage } from "../contracts/voice-signals";
import type { VoiceSignalingAdapter } from "./types";

const ICE_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

/**
 * PeerConnectionManager (v0.1)
 * - P2P mesh connections to all peers.
 * - Deterministic initiator rule to avoid offer collisions:
 *   initiator = (selfUserId < peerUserId) lexicographically
 *
 * Heavy WebRTC coding intentionally minimized in v0.1.
 * The key is consistent naming + flow scaffolding.
 */
export class PeerConnectionManager {
  private readonly selfUserId: string;
  private readonly channelId: string;
  private readonly adapter: VoiceSignalingAdapter;
  private readonly localStream: MediaStream;

  private peers: string[] = [];
  private pcs = new Map<string, RTCPeerConnection>();

  constructor(params: {
    selfUserId: string;
    channelId: string;
    adapter: VoiceSignalingAdapter;
    localStream: MediaStream;
  }) {
    this.selfUserId = params.selfUserId;
    this.channelId = params.channelId;
    this.adapter = params.adapter;
    this.localStream = params.localStream;
  }

  setPeers(peerUserIds: string[]) {
    const normalized = [...new Set(peerUserIds)].filter((id) => id && id !== this.selfUserId);
    this.peers = normalized;

    // Close stale connections when peers leave the channel.
    const active = new Set(this.peers);
    for (const [peerId, pc] of this.pcs.entries()) {
      if (active.has(peerId)) continue;
      try { pc.close(); } catch {}
      this.pcs.delete(peerId);
    }
  }

  async beginNegotiation(): Promise<void> {
    // Create offers only for peers where we are initiator.
    for (const peerId of this.peers) {
      if (this.isInitiator(peerId)) {
        await this.ensurePeerConnection(peerId);
        await this.createAndSendOffer(peerId);
      }
    }
  }

  async handleSignal(msg: VoiceSignalMessage): Promise<void> {
    const peerId = msg.fromUserId;
    await this.ensurePeerConnection(peerId);

    if (msg.type === "VOICE_OFFER") {
      await this.onOffer(peerId, msg.sdp);
      return;
    }
    if (msg.type === "VOICE_ANSWER") {
      await this.onAnswer(peerId, msg.sdp);
      return;
    }
    if (msg.type === "VOICE_ICE") {
      await this.onIce(peerId, msg.candidate);
      return;
    }
  }

  async dispose(): Promise<void> {
    for (const pc of this.pcs.values()) {
      try { pc.close(); } catch {}
    }
    this.pcs.clear();
  }

  private isInitiator(peerId: string): boolean {
    return this.selfUserId.localeCompare(peerId) < 0;
  }

  private async ensurePeerConnection(peerId: string): Promise<RTCPeerConnection> {
    const existing = this.pcs.get(peerId);
    if (existing) return existing;

    const pc = new RTCPeerConnection(ICE_CONFIG);

    // Add local tracks
    for (const track of this.localStream.getTracks()) {
      pc.addTrack(track, this.localStream);
    }

    // ICE trickle
    pc.onicecandidate = (evt) => {
      if (!evt.candidate) return;
      this.adapter.send({
        type: "VOICE_ICE",
        channelId: this.channelId,
        fromUserId: this.selfUserId,
        toUserId: peerId,
        candidate: evt.candidate.toJSON ? evt.candidate.toJSON() : evt.candidate,
      } as any);
    };

    // Remote track handling (future: per-peer volume, mute, indicators)
    pc.ontrack = (_evt) => {
      // placeholder: app can listen via future callbacks
    };

    this.pcs.set(peerId, pc);
    return pc;
  }

  private async createAndSendOffer(peerId: string) {
    const pc = this.pcs.get(peerId)!;
    if (pc.signalingState !== "stable") return;
    const offer = await pc.createOffer({ offerToReceiveAudio: true });
    await pc.setLocalDescription(offer);

    this.adapter.send({
      type: "VOICE_OFFER",
      channelId: this.channelId,
      fromUserId: this.selfUserId,
      toUserId: peerId,
      sdp: offer,
    } as any);
  }

  private async onOffer(peerId: string, sdp: any) {
    const pc = this.pcs.get(peerId)!;

    // Collision guard: if we're initiator and already negotiating, ignore remote offer.
    if (this.isInitiator(peerId) && pc.signalingState !== "stable") {
      return;
    }

    await pc.setRemoteDescription(sdp);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    this.adapter.send({
      type: "VOICE_ANSWER",
      channelId: this.channelId,
      fromUserId: this.selfUserId,
      toUserId: peerId,
      sdp: answer,
    } as any);
  }

  private async onAnswer(peerId: string, sdp: any) {
    const pc = this.pcs.get(peerId)!;
    await pc.setRemoteDescription(sdp);
  }

  private async onIce(peerId: string, candidate: any) {
    const pc = this.pcs.get(peerId)!;
    try {
      await pc.addIceCandidate(candidate);
    } catch {
      // Drop invalid ICE rather than throwing in v0.1
    }
  }
}
