import { renderHook } from "@testing-library/react";
import { vi } from "vitest";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import type { Opponent } from "../../opponent-strip";
import { useActiveTableNotification } from "../useActiveTableNotification";

describe("useActiveTableNotification", () => {
  const mockSnapshot: TableSnapshotPayload = {
    version: 1,
    snapshotId: "test-snapshot",
    snapshotSeq: 1,
    emittedAtTs: Date.now(),
    serverTimeTs: Date.now(),
    stateHash: "test-hash",
    reason: "ACTION_ACCEPTED",
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
    hand: {
      handId: "hand-123",
      handNumber: 1,
      street: "PREFLOP",
      dealerSeat: 0,
      sbSeat: 1,
      bbSeat: 2,
      toActSeat: 3,
      actionCount: 2,
      roundCurrentBetCents: 100,
      minRaiseCents: 200,
      potCents: 300,
      board: [],
    },
    seats: [
      { 
        seat: 0, 
        occupied: true, 
        userId: "hero", 
        name: "Hero", 
        isBot: false, 
        stackCents: 1000, 
        status: "ACTIVE", 
        connected: true,
        roundBetCents: 0,
        committedCents: 0,
        disconnectDeadlineTs: 0,
        isDealer: true,
        isToAct: false,
      },
      { 
        seat: 1, 
        occupied: true, 
        userId: "player1", 
        name: "Alice", 
        isBot: false, 
        stackCents: 1000, 
        status: "ACTIVE", 
        connected: true,
        roundBetCents: 50,
        committedCents: 50,
        disconnectDeadlineTs: 0,
        isDealer: false,
        isToAct: true, // This player is active
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
    ],
    hero: {
      userId: "hero",
      youAreSeated: true,
      seat: 0,
    },
  };

  describe("Priority Logic", () => {
    it("should prioritize hero action processing over other states", () => {
      const opponents: Opponent[] = [
        { seat: 1, id: "player1", name: "Alice", stackCents: 1000, isBot: false, status: "active", isActive: true },
      ];

      const { result } = renderHook(() =>
        useActiveTableNotification(
          false, // waitingBetweenHands
          false, // hasActionOptions
          true,  // actionContextShowActions
          true,  // isPendingHeroAction (highest priority)
          opponents,
          mockSnapshot
        )
      );

      expect(result.current.variant).toBe("processing");
      expect(result.current.showLoadingIndicator).toBe(true);
      expect(result.current.message.length).toBeGreaterThan(0);
    });

    it("should show between hands message when no hand is active", () => {
      const { result } = renderHook(() =>
        useActiveTableNotification(
          true,  // waitingBetweenHands (highest priority when not processing)
          false, // hasActionOptions
          true,  // actionContextShowActions
          false, // isPendingHeroAction
          [],
          undefined // no snapshot
        )
      );

      expect(result.current.variant).toBe("default");
      expect(result.current.showLoadingIndicator).toBe(false);
      expect(result.current.message.length).toBeGreaterThan(0);
    });

    it("should show system processing when actions not ready", () => {
      const { result } = renderHook(() =>
        useActiveTableNotification(
          false, // waitingBetweenHands
          false, // hasActionOptions
          false, // actionContextShowActions (system processing)
          false, // isPendingHeroAction
          [],
          mockSnapshot
        )
      );

      expect(result.current.variant).toBe("processing");
      expect(result.current.showLoadingIndicator).toBe(true);
      expect(result.current.message.length).toBeGreaterThan(0);
    });

    it("should show waiting for others when hand is active but not hero's turn", () => {
      const opponents: Opponent[] = [
        { seat: 1, id: "player1", name: "Alice", stackCents: 1000, isBot: false, status: "active", isActive: true },
      ];

      const { result } = renderHook(() =>
        useActiveTableNotification(
          false, // waitingBetweenHands
          false, // hasActionOptions (not hero's turn)
          true,  // actionContextShowActions
          false, // isPendingHeroAction
          opponents,
          mockSnapshot
        )
      );

      expect(result.current.variant).toBe("waiting");
      expect(result.current.showLoadingIndicator).toBe(false);
    });
  });

  describe("Context-Aware Messages", () => {
    it("should show contextual message with active player name", () => {
      const opponents: Opponent[] = [
        { seat: 1, id: "alice", name: "Alice", stackCents: 1000, isBot: false, status: "active", isActive: true },
      ];

      const { result } = renderHook(() =>
        useActiveTableNotification(
          false, // waitingBetweenHands
          false, // hasActionOptions
          true,  // actionContextShowActions
          false, // isPendingHeroAction
          opponents,
          mockSnapshot
        )
      );

      expect(result.current.message).toMatch(/Alice/);
      expect(result.current.message).toMatch(/Alice/);
    });

    it("should show hand progress message for different streets", () => {
      const flopSnapshot = {
        ...mockSnapshot,
        hand: {
          ...mockSnapshot.hand!,
          street: "FLOP" as const,
          board: ["As", "Kd", "7c"],
        },
      };

      const { result } = renderHook(() =>
        useActiveTableNotification(
          false, // waitingBetweenHands
          false, // hasActionOptions
          true,  // actionContextShowActions
          false, // isPendingHeroAction
          [], // no opponents for hand progress test
          flopSnapshot
        )
      );

      expect(result.current.message.length).toBeGreaterThan(0);
    });

    it("should fallback to generic waiting message when no active players", () => {
      const opponents: Opponent[] = [];

      const { result } = renderHook(() =>
        useActiveTableNotification(
          false, // waitingBetweenHands
          false, // hasActionOptions
          true,  // actionContextShowActions
          false, // isPendingHeroAction
          opponents,
          mockSnapshot
        )
      );

      expect(result.current.variant).toBe("waiting");
      expect(result.current.message).toMatch(/Waiting|Thinking|strategy|Pre-flop|betting round|table is deciding|Patience|Hole cards are being evaluated/i);
    });
  });

  describe("Message Variety", () => {
    it("should show different messages on multiple calls for same condition", () => {
      const messages = new Set<string>();
      
      // Call multiple times to get different random messages
      for (let i = 0; i < 10; i++) {
        const { result } = renderHook(() =>
          useActiveTableNotification(
            true,  // waitingBetweenHands
            false, // hasActionOptions
            true,  // actionContextShowActions
            false, // isPendingHeroAction
            [],
            undefined
          )
        );
        messages.add(result.current.message);
      }

      // Should have multiple different messages (not just one repeated)
      expect(messages.size).toBeGreaterThan(1);
      for (const message of messages) {
        expect(message.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty opponents array gracefully", () => {
      const { result } = renderHook(() =>
        useActiveTableNotification(
          false, // waitingBetweenHands
          false, // hasActionOptions
          true,  // actionContextShowActions
          false, // isPendingHeroAction
          [], // empty opponents
          mockSnapshot
        )
      );

      expect(result.current.message).toBeDefined();
      expect(result.current.variant).toBe("waiting");
    });

    it("should handle missing snapshot gracefully", () => {
      const { result } = renderHook(() =>
        useActiveTableNotification(
          false, // waitingBetweenHands
          false, // hasActionOptions
          true,  // actionContextShowActions
          false, // isPendingHeroAction
          [],
          undefined // no snapshot
        )
      );

      expect(result.current.message).toBeDefined();
      expect(typeof result.current.message).toBe("string");
    });

    it("should provide fallback message for unexpected conditions", () => {
      const { result } = renderHook(() =>
        useActiveTableNotification(
          false, // waitingBetweenHands
          true,  // hasActionOptions (shouldn't show waiting message)
          true,  // actionContextShowActions
          false, // isPendingHeroAction
          [],
          mockSnapshot
        )
      );

      // This shouldn't happen in normal flow, but should have fallback
      expect(result.current.message).toBeDefined();
      expect(typeof result.current.message).toBe("string");
    });
  });

  describe("Visual Variants", () => {
    it("should return correct variant for each notification type", () => {
      const testCases = [
        {
          waitingBetweenHands: true,
          hasActionOptions: false,
          actionContextShowActions: true,
          isPendingHeroAction: false,
          expectedVariant: "default" as const,
        },
        {
          waitingBetweenHands: false,
          hasActionOptions: false,
          actionContextShowActions: true,
          isPendingHeroAction: false,
          expectedVariant: "waiting" as const,
        },
        {
          waitingBetweenHands: false,
          hasActionOptions: false,
          actionContextShowActions: false,
          isPendingHeroAction: false,
          expectedVariant: "processing" as const,
        },
        {
          waitingBetweenHands: false,
          hasActionOptions: false,
          actionContextShowActions: true,
          isPendingHeroAction: true,
          expectedVariant: "processing" as const,
        },
      ];

      testCases.forEach((testCase, index) => {
        const { result } = renderHook(() =>
          useActiveTableNotification(
            testCase.waitingBetweenHands,
            testCase.hasActionOptions,
            testCase.actionContextShowActions,
            testCase.isPendingHeroAction,
            [],
            mockSnapshot
          )
        );

        expect(result.current.variant).toBe(testCase.expectedVariant);
      });
    });

    it("should show loading indicator for processing states", () => {
      const processingCases = [
        {
          waitingBetweenHands: false,
          hasActionOptions: false,
          actionContextShowActions: false,
          isPendingHeroAction: false,
        },
        {
          waitingBetweenHands: false,
          hasActionOptions: false,
          actionContextShowActions: true,
          isPendingHeroAction: true,
        },
      ];

      processingCases.forEach((testCase) => {
        const { result } = renderHook(() =>
          useActiveTableNotification(
            testCase.waitingBetweenHands,
            testCase.hasActionOptions,
            testCase.actionContextShowActions,
            testCase.isPendingHeroAction,
            [],
            mockSnapshot
          )
        );

        expect(result.current.showLoadingIndicator).toBe(true);
      });
    });
  });
});
