/**
 * Minimal snapshot used when building table slots before real snapshot exists.
 * Enables useTableSceneSlots to always run the same hooks (no conditional hook calls).
 * See TABLE_LOADING_AND_TRANSITION_PROPOSAL.md Phase 1.
 */
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";

export const DUMMY_TABLE_SNAPSHOT: TableSnapshotPayload = {
  version: 1,
  snapshotId: "__dummy__",
  snapshotSeq: 1,
  emittedAtTs: 0,
  serverTimeTs: 0,
  stateHash: "",
  reason: "JOIN",
  nextHandAtTs: 0,
  table: {
    tableId: "__dummy__",
    tableName: "Poker Champ",
    visibility: "PUBLIC",
    maxSeats: 2,
    smallBlindCents: 100,
    bigBlindCents: 200,
    minBuyInCents: 100,
    maxBuyInCents: 10000,
    showStats: false,
  },
  seats: [
    { seat: 0, occupied: false, isBot: false, name: "", status: "OUT", stackCents: 0, roundBetCents: 0, committedCents: 0, connected: false, disconnectDeadlineTs: 0, isDealer: false, isToAct: false },
    { seat: 1, occupied: false, isBot: false, name: "", status: "OUT", stackCents: 0, roundBetCents: 0, committedCents: 0, connected: false, disconnectDeadlineTs: 0, isDealer: false, isToAct: false },
  ],
  hero: {
    userId: "__dummy__",
    youAreSeated: false,
  },
};
