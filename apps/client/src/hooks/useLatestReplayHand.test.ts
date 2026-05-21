/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useLatestReplayHand } from "@/hooks/useLatestReplayHand";
import { useAuthStore } from "@/stores/auth.store";

const { getHandsMock, getHandDetailMock } = vi.hoisted(() => ({
  getHandsMock: vi.fn(),
  getHandDetailMock: vi.fn(),
}));

vi.mock("@/services/history.service", () => ({
  historyService: {
    getHands: getHandsMock,
    getHandDetail: getHandDetailMock,
  },
}));

describe("useLatestReplayHand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ token: null, hydrated: true });
  });

  it("does not call history API when auth token is missing", async () => {
    const { result } = renderHook(() => useLatestReplayHand());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.latestHandId).toBeNull();
    expect(result.current.error).toBeNull();
    expect(getHandsMock).not.toHaveBeenCalled();
  });

  it("returns the latest replayable hand id", async () => {
    useAuthStore.setState({ token: "token-1", hydrated: true });
    getHandsMock.mockResolvedValueOnce({
      ok: true,
      data: {
        hands: [
          {
            id: "h1",
            playedAt: new Date("2026-01-01T00:00:00.000Z"),
            tableName: "Table A",
            netResultCents: 100,
            bigBlindCents: 100,
            heroWonCents: 500,
            hasReplay: false,
          },
          {
            id: "h2",
            playedAt: new Date("2026-01-01T00:01:00.000Z"),
            tableName: "Table A",
            netResultCents: 200,
            bigBlindCents: 100,
            heroWonCents: 600,
            hasReplay: true,
          },
        ],
        nextCursor: null,
      },
    });
    const { result } = renderHook(() => useLatestReplayHand());

    await waitFor(() => {
      expect(result.current.latestHandId).toBe("h2");
    });

    expect(getHandsMock).toHaveBeenCalled();
    expect(getHandDetailMock).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
  });

  it("finds replayable hand even when hasReplay flag is missing", async () => {
    useAuthStore.setState({ token: "token-1", hydrated: true });
    getHandsMock.mockResolvedValueOnce({
      ok: true,
      data: {
        hands: [
          {
            id: "h100",
            playedAt: new Date("2026-01-01T00:00:00.000Z"),
            tableName: "Table A",
            netResultCents: 100,
            bigBlindCents: 100,
            heroWonCents: 500,
            hasReplay: undefined,
          },
        ],
        nextCursor: null,
      },
    });
    getHandDetailMock.mockResolvedValueOnce({
      ok: true,
      data: { snapshots: [{ snapshotId: "s100" }] },
    });

    const { result } = renderHook(() => useLatestReplayHand());

    await waitFor(() => {
      expect(result.current.latestHandId).toBe("h100");
    });
  });

  it("sets informative error when hands exist but none have snapshots", async () => {
    useAuthStore.setState({ token: "token-1", hydrated: true });
    getHandsMock.mockResolvedValueOnce({
      ok: true,
      data: {
        hands: [
          {
            id: "h200",
            playedAt: new Date("2026-01-01T00:00:00.000Z"),
            tableName: "Table A",
            netResultCents: 100,
            bigBlindCents: 100,
            heroWonCents: 500,
            hasReplay: undefined,
          },
        ],
        nextCursor: null,
      },
    });
    getHandDetailMock.mockResolvedValueOnce({ ok: true, data: { snapshots: [] } });

    const { result } = renderHook(() => useLatestReplayHand());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.latestHandId).toBeNull();
    expect(result.current.error).toContain("No replay snapshots");
  });

  it("returns error when request fails", async () => {
    useAuthStore.setState({ token: "token-1", hydrated: true });
    getHandsMock.mockRejectedValueOnce(new Error("boom"));

    const { result } = renderHook(() => useLatestReplayHand());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.latestHandId).toBeNull();
    expect(result.current.error).toContain("boom");
  });
});
