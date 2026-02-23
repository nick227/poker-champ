import { beforeEach, describe, expect, it, vi } from "vitest";
import { ColyseusVoiceAdapter } from "@/voice/adapters/ColyseusVoiceAdapter";

describe("ColyseusVoiceAdapter", () => {
  let roomSend: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    roomSend = vi.fn();
  });

  it("sends message when allowedChannelId is not set", () => {
    const room = { send: roomSend, onMessage: vi.fn() };
    const adapter = new ColyseusVoiceAdapter(room);

    adapter.send({
      type: "VOICE_ICE",
      channelId: "any",
      fromUserId: "a",
      toUserId: "b",
      candidate: {},
    });

    expect(roomSend).toHaveBeenCalledTimes(1);
  });

  it("sends when channelId matches allowedChannelId", () => {
    const room = { send: roomSend, onMessage: vi.fn() };
    const adapter = new ColyseusVoiceAdapter(room, { allowedChannelId: "lobby" });

    adapter.send({
      type: "VOICE_OFFER",
      channelId: "lobby",
      fromUserId: "a",
      toUserId: "b",
      sdp: {},
    });

    expect(roomSend).toHaveBeenCalledWith("VOICE_SIGNAL", expect.objectContaining({ channelId: "lobby" }));
  });

  it("drops message when channelId does not match allowedChannelId", () => {
    const room = { send: roomSend, onMessage: vi.fn() };
    const adapter = new ColyseusVoiceAdapter(room, { allowedChannelId: "lobby" });

    adapter.send({
      type: "VOICE_ICE",
      channelId: "table-1",
      fromUserId: "a",
      toUserId: "b",
      candidate: {},
    });

    expect(roomSend).not.toHaveBeenCalled();
  });

  it("drops message over 32k serialized size", () => {
    const room = { send: roomSend, onMessage: vi.fn() };
    const adapter = new ColyseusVoiceAdapter(room);

    const huge = { type: "VOICE_ICE" as const, channelId: "x", fromUserId: "a", toUserId: "b", candidate: "x".repeat(40000) };
    adapter.send(huge);

    expect(roomSend).not.toHaveBeenCalled();
  });

  it("onMessage forwards VOICE_SIGNAL payloads to callback", () => {
    let voiceHandler: ((p: unknown) => void) | null = null;
    const room = {
      send: roomSend,
      onMessage: (type: string, cb: (p: unknown) => void) => {
        if (type === "VOICE_SIGNAL") voiceHandler = cb;
      },
    };
    const adapter = new ColyseusVoiceAdapter(room);
    let captured: unknown = null;
    adapter.onMessage((msg) => {
      captured = msg;
    });

    const payload = { type: "VOICE_OFFER", channelId: "t", fromUserId: "a", toUserId: "b", sdp: {} };
    if (voiceHandler) voiceHandler(payload);

    expect(captured).toEqual(payload);
  });
});
