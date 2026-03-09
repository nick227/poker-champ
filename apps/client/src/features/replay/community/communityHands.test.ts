import { describe, expect, it } from "vitest";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { getCommunityHandById, getDefaultCommunityHand } from "@/features/replay/community/communityHands";
import { assertReplaySnapshotsShape } from "@/features/replay/community/assertReplaySnapshotsShape";

describe("community replay hands", () => {
  it("returns default community hand with snapshots", () => {
    const hand = getDefaultCommunityHand();
    expect(hand.id).toBeTruthy();
    expect(hand.snapshots.length).toBeGreaterThan(0);
    expect(hand.difficulty).toBeTruthy();
    const finalFrame = hand.snapshots[hand.snapshots.length - 1];
    expect(finalFrame.lastHandResult).toBeDefined();
    expect(finalFrame.reason).toBe("HAND_END");
    expect(finalFrame.lastHandResult?.reason).toBe("SHOWDOWN");
    expect(finalFrame.lastHandResult?.winnerId).toBeTruthy();
    expect(Object.keys(finalFrame.lastHandResult?.payoutsByUserId ?? {}).length).toBeGreaterThan(0);
    expect(Object.keys(finalFrame.lastHandResult?.showdownHoleCardsByUserId ?? {}).length).toBeGreaterThanOrEqual(2);
  });

  it("finds hand by id", () => {
    const hand = getDefaultCommunityHand();
    expect(getCommunityHandById(hand.id)?.id).toBe(hand.id);
    expect(getCommunityHandById("missing-hand")).toBeNull();
  });

  it("fails assertion on invalid snapshot version", () => {
    expect(() =>
      assertReplaySnapshotsShape(
        [
          {
            version: 999,
            snapshotId: "bad",
            snapshotSeq: 1,
            emittedAtTs: 0,
            serverTimeTs: 0,
            stateHash: "x",
            reason: "ACTION_ACCEPTED",
            table: {
              tableId: "t",
              tableName: "T",
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
                userId: "u",
                name: "U",
                stackCents: 1000,
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
              userId: "u",
              youAreSeated: true,
              seat: 0,
            },
            hand: {
              handId: "h",
              handNumber: 1,
              street: "PREFLOP",
              board: [],
              potCents: 0,
              dealerSeat: 0,
              sbSeat: 0,
              bbSeat: 1,
              toActSeat: 0,
              actionCount: 0,
              roundCurrentBetCents: 0,
              minRaiseCents: 0,
            },
          } as unknown as TableSnapshotPayload,
        ],
        "bad",
      ),
    ).toThrow(/unsupported snapshot version/i);
  });

  it("fails assertion when final snapshot omits showdown details", () => {
    const base = getDefaultCommunityHand().snapshots;
    const badFinal: TableSnapshotPayload = {
      ...base[base.length - 1],
      reason: "HAND_END",
      lastHandResult: {
        ...base[base.length - 1].lastHandResult!,
        reason: "SHOWDOWN",
        showdownHoleCardsByUserId: { "hero-user": ["As", "Kd"] },
      },
    };
    const bad = [...base.slice(0, -1), badFinal];
    expect(() => assertReplaySnapshotsShape(bad, "bad-showdown")).toThrow(/showdown hole cards/i);
  });
});
