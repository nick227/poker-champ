/**
 * Jittered exponential backoff for reconnect scheduling.
 *
 * Covers: the pure `computeReconnectDelayMs` formula (increasing sequence bounded by the cap,
 * jitter present) plus an integration-level check that the WS transport's attempt counter
 * actually resets after a successful connection (so a long-lived, healthy connection that later
 * drops once doesn't inherit a stretched-out delay from an earlier failure streak).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RECONNECT_BASE_DELAY_MS, RECONNECT_MAX_DELAY_MS } from "@/constants";
import { computeReconnectDelayMs, createRealtimeSession } from "@/realtime/transport";

describe("computeReconnectDelayMs", () => {
  it("increases with attempt number, bounded by the cap", () => {
    const noJitter = () => 0; // jitterFactor pinned at its minimum (0.5)
    const d0 = computeReconnectDelayMs(0, noJitter);
    const d1 = computeReconnectDelayMs(1, noJitter);
    const d2 = computeReconnectDelayMs(2, noJitter);
    const d10 = computeReconnectDelayMs(10, noJitter);

    expect(d0).toBeLessThan(d1);
    expect(d1).toBeLessThan(d2);
    expect(d2).toBeLessThanOrEqual(RECONNECT_MAX_DELAY_MS);
    expect(d10).toBeLessThanOrEqual(RECONNECT_MAX_DELAY_MS);
    // Once capped, further attempts don't keep growing.
    expect(d10).toBe(computeReconnectDelayMs(11, noJitter));
  });

  it("stays within [0.5x, 1x] of the capped exponential value", () => {
    const attempt = 5;
    const uncappedExpected = RECONNECT_BASE_DELAY_MS * 2 ** attempt;
    const cappedExpected = Math.min(RECONNECT_MAX_DELAY_MS, uncappedExpected);

    const low = computeReconnectDelayMs(attempt, () => 0);
    const high = computeReconnectDelayMs(attempt, () => 1);

    expect(low).toBe(Math.round(cappedExpected * 0.5));
    expect(high).toBe(Math.round(cappedExpected * 1));
  });

  it("applies jitter so the delay is not deterministic/fixed across calls", () => {
    const samples = new Set<number>();
    for (let i = 0; i < 25; i++) {
      samples.add(computeReconnectDelayMs(3));
    }
    // With real randomness, 25 samples at attempt 3 should not all collapse to one value.
    expect(samples.size).toBeGreaterThan(1);
  });

  it("never returns a negative or NaN delay for degenerate input", () => {
    expect(computeReconnectDelayMs(-5, () => 0.3)).toBeGreaterThan(0);
    expect(Number.isNaN(computeReconnectDelayMs(-5, () => 0.3))).toBe(false);
  });
});

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

describe("WS transport reconnect backoff", () => {
  beforeEach(() => {
    instances = [];
    vi.stubGlobal("WebSocket", MockWebSocket);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("grows the scheduled delay across consecutive failures, then resets after a success", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // pin jitterFactor at 0.5 for exact assertions
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

    createRealtimeSession({ transport: "ws", url: "http://test.local", onMessage: vi.fn() });

    // Attempt 0: socketA fails without ever opening.
    instances[0].onclose?.();

    // Attempt 1: socketB (scheduled reconnect) also fails without opening.
    vi.runOnlyPendingTimers();
    instances[1].onclose?.();

    // Attempt succeeds: socketC opens, which must reset the attempt counter.
    vi.runOnlyPendingTimers();
    instances[2].onopen?.();

    // socketC then drops -> the next scheduled delay must be back at attempt 0, not attempt 2.
    instances[2].onclose?.();

    const scheduledDelays = setTimeoutSpy.mock.calls
      .map((call) => call[1])
      .filter((delay): delay is number => typeof delay === "number");

    expect(scheduledDelays).toHaveLength(3);
    const [delayAttempt0, delayAttempt1, delayAfterReset] = scheduledDelays;

    expect(delayAttempt1).toBeGreaterThan(delayAttempt0);
    // After the successful connect reset the counter, the next delay matches attempt 0 again —
    // not a continuation of the exponential growth (which would exceed delayAttempt1).
    expect(delayAfterReset).toBe(delayAttempt0);
    expect(delayAfterReset).toBeLessThan(delayAttempt1);
  });
});
