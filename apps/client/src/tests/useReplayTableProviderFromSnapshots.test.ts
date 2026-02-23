/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { useReplayTableProviderFromSnapshots } from "@/hooks/useReplayTableProviderFromSnapshots";

function makeMinimalSnapshot(seq: number): TableSnapshotPayload {
  return {
    version: 1,
    snapshotId: `snap_${seq}`,
    snapshotSeq: seq,
    emittedAtTs: Date.now(),
    serverTimeTs: Date.now(),
    stateHash: "hash",
    reason: "ACTION_ACCEPTED",
    table: {
      tableId: "t1",
      tableName: "Table 1",
      visibility: "PUBLIC",
      maxSeats: 6,
      smallBlindCents: 50,
      bigBlindCents: 100,
      minBuyInCents: 1000,
      maxBuyInCents: 10000,
    },
    seats: [
      {
        seat: 0,
        occupied: true,
        userId: "hero",
        name: "Hero",
        stackCents: 2000,
        roundBetCents: 0,
        committedCents: 0,
        connected: true,
        disconnectDeadlineTs: 0,
        isDealer: false,
        status: "ACTIVE",
        isToAct: false,
        isBot: false,
      },
    ],
    hero: {
      userId: "hero",
      youAreSeated: true,
      seat: 0,
    },
    hand: {
      handId: "h1",
      handNumber: 1,
      street: "PREFLOP",
      board: [],
      potCents: 150,
      dealerSeat: 0,
      sbSeat: 0,
      bbSeat: 1,
      toActSeat: 0,
      actionCount: 0,
      roundCurrentBetCents: 0,
      minRaiseCents: 0,
    },
  };
}

describe("useReplayTableProviderFromSnapshots", () => {
  it("returns error and no provider when snapshots is empty", () => {
    const { result } = renderHook(() =>
      useReplayTableProviderFromSnapshots([]),
    );
    expect(result.current.provider).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe("No replay data.");
  });

  it("returns provider with replay controller when snapshots has one frame", () => {
    const snapshots = [makeMinimalSnapshot(1)];
    const { result } = renderHook(() =>
      useReplayTableProviderFromSnapshots(snapshots),
    );
    expect(result.current.error).toBeNull();
    expect(result.current.provider).not.toBeNull();
    expect(result.current.provider?.replay.currentStep).toBe(0);
    expect(result.current.provider?.replay.totalSteps).toBe(1);
    expect(result.current.provider?.snapshot.snapshotSeq).toBe(1);
  });

  it("next/prev update currentStep and snapshot", () => {
    const snapshots = [
      makeMinimalSnapshot(1),
      makeMinimalSnapshot(2),
      makeMinimalSnapshot(3),
    ];
    const { result } = renderHook(() =>
      useReplayTableProviderFromSnapshots(snapshots),
    );
    expect(result.current.provider?.replay.currentStep).toBe(0);
    act(() => {
      result.current.provider?.replay.next();
    });
    expect(result.current.provider?.replay.currentStep).toBe(1);
    expect(result.current.provider?.snapshot.snapshotSeq).toBe(2);
    act(() => {
      result.current.provider?.replay.next();
    });
    expect(result.current.provider?.replay.currentStep).toBe(2);
    act(() => {
      result.current.provider?.replay.prev();
    });
    expect(result.current.provider?.replay.currentStep).toBe(1);
  });

  it("goTo jumps to step", () => {
    const snapshots = [
      makeMinimalSnapshot(1),
      makeMinimalSnapshot(2),
      makeMinimalSnapshot(3),
    ];
    const { result } = renderHook(() =>
      useReplayTableProviderFromSnapshots(snapshots),
    );
    act(() => {
      result.current.provider?.replay.goTo(2);
    });
    expect(result.current.provider?.replay.currentStep).toBe(2);
    expect(result.current.provider?.snapshot.snapshotSeq).toBe(3);
  });

  it("sceneModel has canAct false", () => {
    const snapshots = [makeMinimalSnapshot(1)];
    const { result } = renderHook(() =>
      useReplayTableProviderFromSnapshots(snapshots),
    );
    expect(result.current.provider?.sceneModel.canAct).toBe(false);
    expect(result.current.provider?.sceneModel.actionContext.showActions).toBe(
      false,
    );
  });
});
