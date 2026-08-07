/**
 * Session-generation fencing for the plain WebSocket transport.
 *
 * Without a generation counter, a straggling event from a superseded socket (e.g. a delayed
 * `onopen` that fires after a newer reconnect attempt has already connected) could clobber the
 * state of the currently active connection. These tests assert that late/stale events from a
 * superseded socket are no-ops once a newer attempt has taken over.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRealtimeSession } from "@/realtime/transport";

type Handler = (() => void) | null;

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  onopen: Handler = null;
  onclose: Handler = null;
  onerror: Handler = null;
  onmessage: ((event: { data: string }) => void) | null = null;

  constructor(public url: string) {
    instances.push(this);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
  }

  send(_data: string) {}
}

let instances: MockWebSocket[] = [];

describe("WS transport session-generation fencing", () => {
  beforeEach(() => {
    instances = [];
    vi.stubGlobal("WebSocket", MockWebSocket);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("ignores a stale socket's late onopen after a newer attempt already connected", () => {
    const onMessage = vi.fn();
    const onOpen = vi.fn();

    createRealtimeSession({
      transport: "ws",
      url: "http://test.local",
      onMessage,
      onOpen,
    });

    expect(instances).toHaveLength(1);
    const socketA = instances[0];

    // socketA drops unexpectedly -> schedules a reconnect.
    socketA.onclose?.();
    expect(onMessage).toHaveBeenCalledWith({ type: "DISCONNECTED" });
    expect(onMessage).toHaveBeenCalledWith({ type: "RECONNECTING" });

    // The scheduled reconnect fires -> a newer socket (generation 2) is created.
    vi.runOnlyPendingTimers();
    expect(instances).toHaveLength(2);
    const socketB = instances[1];

    // socketB connects successfully and becomes the current, live session.
    socketB.onopen?.();
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onMessage.mock.calls.filter((c) => c[0]?.type === "CONNECTED")).toHaveLength(1);

    // socketA is stale (superseded), but a late/delayed event fires anyway — simulating a
    // straggling browser event queued before the socket was torn down. This must be a no-op:
    // no extra onOpen call, no extra CONNECTED dispatch, nothing clobbered.
    socketA.onopen?.();

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onMessage.mock.calls.filter((c) => c[0]?.type === "CONNECTED")).toHaveLength(1);
  });

  it("ignores stale onclose/onmessage from a superseded socket", () => {
    const onMessage = vi.fn();

    createRealtimeSession({
      transport: "ws",
      url: "http://test.local",
      onMessage,
    });

    const socketA = instances[0];
    socketA.onopen?.();
    socketA.onclose?.();
    vi.runOnlyPendingTimers();

    const socketB = instances[1];
    socketB.onopen?.();
    onMessage.mockClear();

    // Stale events from socketA (already superseded) must not reach the consumer.
    socketA.onmessage?.({ data: JSON.stringify({ type: "STALE_EVENT" }) });
    socketA.onclose?.();

    expect(onMessage).not.toHaveBeenCalled();

    // socketB (current, live) still delivers normally.
    socketB.onmessage?.({ data: JSON.stringify({ type: "LIVE_EVENT" }) });
    expect(onMessage).toHaveBeenCalledWith({ type: "LIVE_EVENT", payload: undefined });
  });

  it("disconnect() fences any in-flight connect attempt so it cannot dispatch afterward", () => {
    const onMessage = vi.fn();
    const onOpen = vi.fn();

    const session = createRealtimeSession({
      transport: "ws",
      url: "http://test.local",
      onMessage,
      onOpen,
    });

    const socketA = instances[0];
    session.disconnect();
    onMessage.mockClear();

    // A delayed onopen arrives after disconnect() — must be ignored entirely.
    socketA.onopen?.();

    expect(onOpen).not.toHaveBeenCalled();
    expect(onMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "CONNECTED" }));
  });
});
