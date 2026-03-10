import { renderHook } from "@testing-library/react";
import { vi } from "vitest";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import type { Opponent } from "../../opponent-strip";
import { useEmptyTableNotification } from "../useEmptyTableNotification";

describe("useEmptyTableNotification", () => {
  const mockSnapshot: TableSnapshotPayload = {
    version: 1,
    snapshotId: "test-snapshot",
    snapshotSeq: 1,
    emittedAtTs: Date.now(),
    serverTimeTs: Date.now(),
    stateHash: "test-hash",
    reason: "JOIN",
    table: {
      tableId: "test-table",
      tableName: "Test Table",
      visibility: "PUBLIC",
      maxSeats: 6,
      smallBlindCents: 50,
      bigBlindCents: 100,
      minBuyInCents: 1000,
      maxBuyInCents: 10000,
      showStats: true,
    },
    seats: [
      { 
        seat: 0, 
        occupied: true, 
        userId: "hero", 
        name: "Hero", 
        isBot: false, 
        stackCents: 1000, 
        status: "WAITING", 
        connected: true,
        roundBetCents: 0,
        committedCents: 0,
        disconnectDeadlineTs: 0,
        isDealer: false,
        isToAct: false,
      },
      { 
        seat: 1, 
        occupied: false, 
        isBot: false, 
        name: "", 
        status: "OUT", 
        stackCents: 0,
        roundBetCents: 0,
        committedCents: 0,
        disconnectDeadlineTs: 0,
        isDealer: false,
        isToAct: false,
        connected: false,
      },
      { 
        seat: 2, 
        occupied: false, 
        isBot: false, 
        name: "", 
        status: "OUT", 
        stackCents: 0,
        roundBetCents: 0,
        committedCents: 0,
        disconnectDeadlineTs: 0,
        isDealer: false,
        isToAct: false,
        connected: false,
      },
      { 
        seat: 3, 
        occupied: false, 
        isBot: false, 
        name: "", 
        status: "OUT", 
        stackCents: 0,
        roundBetCents: 0,
        committedCents: 0,
        disconnectDeadlineTs: 0,
        isDealer: false,
        isToAct: false,
        connected: false,
      },
      { 
        seat: 4, 
        occupied: false, 
        isBot: false, 
        name: "", 
        status: "OUT", 
        stackCents: 0,
        roundBetCents: 0,
        committedCents: 0,
        disconnectDeadlineTs: 0,
        isDealer: false,
        isToAct: false,
        connected: false,
      },
      { 
        seat: 5, 
        occupied: false, 
        isBot: false, 
        name: "", 
        status: "OUT", 
        stackCents: 0,
        roundBetCents: 0,
        committedCents: 0,
        disconnectDeadlineTs: 0,
        isDealer: false,
        isToAct: false,
        connected: false,
      },
    ],
    hero: {
      userId: "hero",
      youAreSeated: true,
      seat: 0,
    },
  };

  it("should return default message when hero is seated and no special conditions", () => {
    const opponents: Opponent[] = [];
    
    const { result } = renderHook(() =>
      useEmptyTableNotification(mockSnapshot, opponents)
    );

    expect(result.current.message).toMatch(/only player|Solo poker|lonely|Lone Ranger|card sorting|empty castle/i);
    expect(result.current.actions).toBeUndefined();
  });

  it("should show 'hero only player' message when no opponents", () => {
    const opponents: Opponent[] = [];
    const onAddBot = vi.fn();
    const onInvitePlayer = vi.fn();
    
    const { result } = renderHook(() =>
      useEmptyTableNotification(mockSnapshot, opponents, onAddBot, onInvitePlayer)
    );

    expect(result.current.message).toMatch(/only player|Solo poker|lonely|Lone Ranger|card sorting|empty castle/i);
    expect(result.current.actions).toHaveLength(2);
    expect(result.current.actions?.[0].title).toBe("Add Bot");
    expect(result.current.actions?.[1].title).toBe("Invite Player");
  });

  it("should show 'all bots busted' message when all bots have 0 chips", () => {
    const opponents: Opponent[] = [
      { seat: 1, id: "bot1", name: "Bot 1", stackCents: 0, isBot: true, status: "sittingOut" },
      { seat: 2, id: "bot2", name: "Bot 2", stackCents: 0, isBot: true, status: "sittingOut" },
    ];
    const onAddBot = vi.fn();
    const onInvitePlayer = vi.fn();
    
    const { result } = renderHook(() =>
      useEmptyTableNotification(mockSnapshot, opponents, onAddBot, onInvitePlayer)
    );

    expect(result.current.message).toMatch(/bots are out of chips|vanquished|Bot graveyard|AI has learned|All bots busted|bot massacre/i);
    expect(result.current.actions).toHaveLength(2);
    expect(result.current.actions?.[0].title).toBe("Add Bot");
    expect(result.current.actions?.[1].title).toBe("Invite Player");
  });

  it("should show 'waiting for players' message when table has empty seats", () => {
    const opponents: Opponent[] = [
      { seat: 1, id: "bot1", name: "Bot 1", stackCents: 1000, isBot: true, status: "active" },
    ];
    const onAddBot = vi.fn();
    
    const { result } = renderHook(() =>
      useEmptyTableNotification(mockSnapshot, opponents, onAddBot)
    );

    expect(result.current.message).toMatch(/Waiting for more players|more the merrier|better with more|poker empire|feeling a bit empty|Good things come/i);
    expect(result.current.actions).toHaveLength(1);
    expect(result.current.actions?.[0].title).toBe("Add Bot");
  });

  it("should not show actions when handlers are not provided", () => {
    const opponents: Opponent[] = [];
    
    const { result } = renderHook(() =>
      useEmptyTableNotification(mockSnapshot, opponents)
    );

    expect(result.current.message).toMatch(/only player|Solo poker|lonely|Lone Ranger|card sorting|empty castle/i);
    expect(result.current.actions).toBeUndefined();
  });
});
