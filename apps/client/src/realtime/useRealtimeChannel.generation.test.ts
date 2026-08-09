/**
 * Session-generation fencing at the `useRealtimeChannel` hook layer.
 *
 * When the hook's connect effect re-runs (e.g. the target id changes), a new realtime session is
 * created and the old one is torn down. If the old session's transport-level callbacks were ever
 * to fire late — after the new session has already taken over — they must not be forwarded to
 * the consumer. This test forces exactly that ordering by mocking `createRealtimeSession` so the
 * test controls precisely when each session's `onOpen`/`onMessage` callbacks fire, independent of
 * the mocked transport's own internal fencing.
 */
/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createRealtimeSessionMock = vi.fn();

vi.mock("@/realtime/transport", () => ({
  createRealtimeSession: (...args: unknown[]) => createRealtimeSessionMock(...args),
}));

vi.mock("@poker-champ/sdk", () => ({
  getAuthToken: () => "test-token",
}));

vi.mock("@/registry/transport.registry", () => ({
  resolveRealtimeTransportConfig: (input: { id?: string }) => ({
    transport: "ws" as const,
    url: `wss://test/${input.id}`,
  }),
}));

vi.mock("@/stores/e2eConnectionCount.store", () => ({
  useE2EConnectionCountStore: { getState: () => ({ increment: vi.fn(), decrement: vi.fn() }) },
}));

import { useRealtimeChannel } from "@/realtime/useRealtimeChannel";

type CapturedSession = {
  options: Record<string, any>;
  disconnect: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  getNativeRoom: ReturnType<typeof vi.fn>;
};

let capturedSessions: CapturedSession[] = [];

function stubSessionFactory() {
  createRealtimeSessionMock.mockImplementation((options: Record<string, any>) => {
    const session: CapturedSession = {
      options,
      disconnect: vi.fn(),
      send: vi.fn().mockReturnValue(true),
      getNativeRoom: vi.fn().mockReturnValue({ id: options.url }),
    };
    capturedSessions.push(session);
    return session;
  });
}

describe("useRealtimeChannel session-generation fencing", () => {
  beforeEach(() => {
    capturedSessions = [];
    createRealtimeSessionMock.mockReset();
    stubSessionFactory();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("ignores a stale (superseded) session's late onMessage/onOpen after a newer session has already taken over", () => {
    const onMessage = vi.fn();
    const onOpen = vi.fn();

    const { rerender } = renderHook(
      ({ id }) =>
        useRealtimeChannel({
          scope: "table",
          id,
          enabled: true,
          authHydrated: true,
          onMessage,
          onOpen,
        }),
      { initialProps: { id: "table-1" } },
    );

    expect(capturedSessions).toHaveLength(1);
    const sessionA = capturedSessions[0];

    // Re-render with a new id: React tears down the effect (disconnects sessionA) and mounts a
    // new one (sessionB) — a new generation.
    act(() => {
      rerender({ id: "table-2" });
    });

    expect(sessionA.disconnect).toHaveBeenCalledWith(false);
    expect(capturedSessions).toHaveLength(2);
    const sessionB = capturedSessions[1];

    // sessionB (current generation) connects successfully.
    act(() => {
      sessionB.options.onOpen();
      sessionB.options.onMessage({ type: "CONNECTED" });
    });

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith({ type: "CONNECTED" });
    onMessage.mockClear();
    onOpen.mockClear();

    // sessionA's callbacks fire late — simulating a delayed/superseded connect resolving after
    // sessionB already won. Even though sessionA's own mock `disconnect` is a no-op stub (unlike
    // the real transport, which would already self-fence), the hook's generation guard must still
    // prevent this from reaching the consumer.
    act(() => {
      sessionA.options.onOpen();
      sessionA.options.onMessage({ type: "CONNECTED" });
      sessionA.options.onMessage({ type: "STATE_UPDATE", payload: { stale: true } });
    });

    expect(onOpen).not.toHaveBeenCalled();
    expect(onMessage).not.toHaveBeenCalled();
  });

  it("does not fence the live session's own callbacks", () => {
    const onMessage = vi.fn();

    renderHook(() =>
      useRealtimeChannel({
        scope: "table",
        id: "table-1",
        enabled: true,
        authHydrated: true,
        onMessage,
      }),
    );

    const session = capturedSessions[0];
    act(() => {
      session.options.onMessage({ type: "CONNECTED" });
      session.options.onMessage({ type: "STATE_UPDATE", payload: { ok: true } });
    });

    expect(onMessage).toHaveBeenCalledWith({ type: "CONNECTED" });
    expect(onMessage).toHaveBeenCalledWith({ type: "STATE_UPDATE", payload: { ok: true } });
  });
});
