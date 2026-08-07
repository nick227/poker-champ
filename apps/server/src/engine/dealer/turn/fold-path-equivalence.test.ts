import { describe, expect, it, vi } from "vitest";
import { ActionService } from "./ActionService.js";
import { assertStateInvariants } from "../../invariants/assertState.js";
import { PokerState } from "../../../state/PokerState.js";
import { PlayerState } from "../../../state/PlayerState.js";

function makeActiveState(): PokerState {
  const state = new PokerState();
  state.roundState = "WAITING_FOR_ACTION";
  return state;
}

function makePlayer(input: {
  id: string;
  seat: number;
  stackCents?: number;
  roundBetCents?: number;
  committedCents?: number;
  status?: PlayerState["status"];
  needsAction?: boolean;
}): PlayerState {
  const p = new PlayerState();
  p.id = input.id;
  p.userId = input.id;
  p.kind = "HUMAN";
  p.name = input.id;
  p.seat = input.seat;
  p.stackCents = input.stackCents ?? 5000;
  p.roundBetCents = input.roundBetCents ?? 0;
  p.committedCents = input.committedCents ?? 0;
  p.status = input.status ?? "ACTIVE";
  p.needsAction = input.needsAction ?? true;
  p.connected = true;
  return p;
}

function makeStateAndActor() {
  const state = makeActiveState();
  state.tableId = "table_fold_equivalence";
  state.handId = "hand_fold_equivalence";
  state.street = "TURN";
  state.potCents = 700;
  state.roundCurrentBetCents = 200;
  state.minRaiseCents = 100;
  state.toActSeat = 0;
  state.seats.push("u1", "u2");

  const actor = makePlayer({
    id: "u1",
    seat: 0,
    stackCents: 2100,
    roundBetCents: 200,
    committedCents: 200,
    status: "ACTIVE",
    needsAction: true,
  });
  const other = makePlayer({
    id: "u2",
    seat: 1,
    stackCents: 1900,
    roundBetCents: 200,
    committedCents: 200,
    status: "ACTIVE",
    needsAction: false,
  });

  state.playersById.set(actor.id, actor);
  state.playersById.set(other.id, other);

  return { state, actor, other };
}

async function runFoldScenario(kind: "PLAYER" | "AUTO" | "FORCED") {
  const { state, actor } = makeStateAndActor();
  const actionService = new ActionService({
    state,
    getHeroActionOptions: () => undefined,
    getLastAction: () => undefined,
  });

  const applyActionDebit = vi.fn().mockResolvedValue(undefined);
  const recordAcceptedAction = vi.fn().mockResolvedValue(undefined);

  const execution =
    kind === "FORCED"
      ? await actionService.executeForcedFold({
          state,
          userId: actor.id,
          origin: "FORCED",
          recordAcceptedAction,
        })
      : await actionService.execute({
          state,
          userId: actor.id,
          msg: { action: "FOLD" },
          origin: kind,
          applyActionDebit,
          recordAcceptedAction,
          assertCanAfford: () => {},
        });

  return {
    state,
    actor,
    execution,
    applyActionDebit,
    recordAcceptedAction,
  };
}

describe("fold / abandon / disconnect money equivalence", () => {
  it("keeps identical money outcomes for ACTIVE fold, forced fold (abandon), and AUTO fold (disconnect)", async () => {
    const playerFold = await runFoldScenario("PLAYER");
    const forcedFold = await runFoldScenario("FORCED");
    const autoFold = await runFoldScenario("AUTO");

    const normalize = (x: Awaited<ReturnType<typeof runFoldScenario>>) => ({
      actorStatus: x.actor.status,
      actorStackCents: x.actor.stackCents,
      actorRoundBetCents: x.actor.roundBetCents,
      actorCommittedCents: x.actor.committedCents,
      potCents: x.state.potCents,
      roundCurrentBetCents: x.state.roundCurrentBetCents,
      resultKind: x.execution.result.kind,
      lastActionAmount: x.execution.lastAction?.amountCents,
      lastActionPotAfter: x.execution.lastAction?.potAfterCents,
      lastActionAction: x.execution.lastAction?.action,
    });

    expect(normalize(playerFold)).toEqual(normalize(forcedFold));
    expect(normalize(playerFold)).toEqual(normalize(autoFold));

    expect(playerFold.recordAcceptedAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "FOLD", amountCents: 0, potBeforeCents: 700, potAfterCents: 700 }),
    );
    expect(forcedFold.recordAcceptedAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "FOLD", amountCents: 0, potBeforeCents: 700, potAfterCents: 700 }),
    );
    expect(autoFold.recordAcceptedAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "FOLD", amountCents: 0, potBeforeCents: 700, potAfterCents: 700 }),
    );

    expect(playerFold.applyActionDebit).not.toHaveBeenCalled();
    expect(autoFold.applyActionDebit).not.toHaveBeenCalled();
  });

  it("keeps roundCurrentBetCents aligned when the highest bettor folds", async () => {
    const state = makeActiveState();
    state.tableId = "table_fold_high_bet";
    state.handId = "hand_fold_high_bet";
    state.street = "TURN";
    state.potCents = 1200;
    state.roundCurrentBetCents = 300;
    state.minRaiseCents = 100;
    state.toActSeat = 0;
    state.seats.push("u1", "u2", "u3");

    const folder = makePlayer({
      id: "u1",
      seat: 0,
      roundBetCents: 300,
      committedCents: 300,
      status: "ACTIVE",
      needsAction: true,
    });
    const caller = makePlayer({
      id: "u2",
      seat: 1,
      roundBetCents: 200,
      committedCents: 200,
      status: "ACTIVE",
      needsAction: false,
    });
    const allIn = makePlayer({
      id: "u3",
      seat: 2,
      roundBetCents: 100,
      committedCents: 100,
      stackCents: 0,
      status: "ALL_IN",
      needsAction: false,
    });

    state.playersById.set(folder.id, folder);
    state.playersById.set(caller.id, caller);
    state.playersById.set(allIn.id, allIn);
    const actionService = new ActionService({
      state,
      getHeroActionOptions: () => undefined,
      getLastAction: () => undefined,
    });

    const recordAcceptedAction = vi.fn().mockResolvedValue(undefined);
    const execution = await actionService.execute({
      state,
      userId: folder.id,
      msg: { action: "FOLD" },
      origin: "PLAYER",
      applyActionDebit: vi.fn().mockResolvedValue(undefined),
      recordAcceptedAction,
      assertCanAfford: () => {},
    });

    expect(execution.lastAction?.action).toBe("FOLD");
    expect(state.roundCurrentBetCents).toBe(200);
    expect(() => assertStateInvariants(state)).not.toThrow();
    expect(recordAcceptedAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "FOLD", amountCents: 0, potBeforeCents: 1200, potAfterCents: 1200 }),
    );
  });

  // Regression coverage for the same root cause as "keeps roundCurrentBetCents aligned
  // when the highest bettor folds": bettingRoundComplete()/noFurtherBettingPossible() must
  // decide round-completion from `needsAction` (the field everything else already trusts:
  // findNextToActSeat, assertToActOrRoundComplete, assertStateInvariants), not from a
  // hasActedThisStreet re-derivation that disagrees with it whenever a fold changes who is
  // still eligible. These scenarios probe the same class of bug from different angles.

  it("does not corrupt roundCurrentBetCents or crash when a NON-max (second-highest) bettor folds", async () => {
    // u1 is the true highest bettor and has already settled (matches the max, done acting).
    // u2 is the second-highest and folds. Removing u2 must not change roundCurrentBetCents
    // (u1 is still present and still the max), and since u1 has nothing left to decide and
    // u4 is ALL_IN, the street must correctly resolve to complete rather than crash while
    // hunting for a next actor to assign to u2's now-folded seat.
    const state = makeActiveState();
    state.tableId = "table_fold_non_max";
    state.handId = "hand_fold_non_max";
    state.street = "TURN";
    state.potCents = 900;
    state.roundCurrentBetCents = 500;
    state.minRaiseCents = 100;
    state.toActSeat = 1;
    state.seats.push("u1", "u2", "u4");

    const settled = makePlayer({
      id: "u1",
      seat: 0,
      roundBetCents: 500,
      committedCents: 500,
      status: "ACTIVE",
      needsAction: false,
    });
    const folder = makePlayer({
      id: "u2",
      seat: 1,
      roundBetCents: 300,
      committedCents: 300,
      status: "ACTIVE",
      needsAction: true,
    });
    const allIn = makePlayer({
      id: "u4",
      seat: 2,
      roundBetCents: 100,
      committedCents: 100,
      stackCents: 0,
      status: "ALL_IN",
      needsAction: false,
    });

    state.playersById.set(settled.id, settled);
    state.playersById.set(folder.id, folder);
    state.playersById.set(allIn.id, allIn);
    const actionService = new ActionService({
      state,
      getHeroActionOptions: () => undefined,
      getLastAction: () => undefined,
    });

    const execution = await actionService.execute({
      state,
      userId: folder.id,
      msg: { action: "FOLD" },
      origin: "PLAYER",
      applyActionDebit: vi.fn().mockResolvedValue(undefined),
      recordAcceptedAction: vi.fn().mockResolvedValue(undefined),
      assertCanAfford: () => {},
    });

    expect(execution.result.kind).toBe("STREET_COMPLETE");
    expect(state.roundCurrentBetCents).toBe(500);
    expect(() => assertStateInvariants(state)).not.toThrow();
  });

  it("keeps roundCurrentBetCents correct and never leaves toActSeat on a folded seat across two sequential folds", async () => {
    // u1 (highest) is force-folded first, dropping the max to u2's level. u2 (now the
    // highest remaining) is force-folded second, dropping the max again to u3's level.
    // u3 has a genuinely unresolved decision (needsAction=true) throughout, so the round
    // must stay open and toActSeat must keep pointing at u3 (never at a folded seat) after
    // each fold, with roundCurrentBetCents correctly re-synced both times.
    const state = makeActiveState();
    state.tableId = "table_fold_sequential";
    state.handId = "hand_fold_sequential";
    state.street = "TURN";
    state.potCents = 1150;
    state.roundCurrentBetCents = 500;
    state.minRaiseCents = 100;
    state.toActSeat = 2;
    state.seats.push("u1", "u2", "u3", "u4");

    const first = makePlayer({
      id: "u1",
      seat: 0,
      roundBetCents: 500,
      committedCents: 500,
      status: "ACTIVE",
      needsAction: false,
    });
    const second = makePlayer({
      id: "u2",
      seat: 1,
      roundBetCents: 400,
      committedCents: 400,
      status: "ACTIVE",
      needsAction: false,
    });
    const pending = makePlayer({
      id: "u3",
      seat: 2,
      roundBetCents: 150,
      committedCents: 150,
      status: "ACTIVE",
      needsAction: true,
    });
    const allIn = makePlayer({
      id: "u4",
      seat: 3,
      roundBetCents: 100,
      committedCents: 100,
      stackCents: 0,
      status: "ALL_IN",
      needsAction: false,
    });

    state.playersById.set(first.id, first);
    state.playersById.set(second.id, second);
    state.playersById.set(pending.id, pending);
    state.playersById.set(allIn.id, allIn);
    const actionService = new ActionService({
      state,
      getHeroActionOptions: () => undefined,
      getLastAction: () => undefined,
    });

    const step1 = await actionService.executeForcedFold({
      state,
      userId: first.id,
      origin: "FORCED",
      recordAcceptedAction: vi.fn().mockResolvedValue(undefined),
    });

    expect(step1.result.kind).toBe("TURN_ADVANCED");
    expect(state.roundCurrentBetCents).toBe(400);
    expect(state.toActSeat).toBe(2);
    expect(() => assertStateInvariants(state)).not.toThrow();

    const step2 = await actionService.executeForcedFold({
      state,
      userId: second.id,
      origin: "FORCED",
      recordAcceptedAction: vi.fn().mockResolvedValue(undefined),
    });

    expect(step2.result.kind).toBe("TURN_ADVANCED");
    expect(state.roundCurrentBetCents).toBe(150);
    expect(state.toActSeat).toBe(2);
    expect(() => assertStateInvariants(state)).not.toThrow();
  });

  it("does NOT short-circuit to STREET_COMPLETE when multiple remaining players still need to act", async () => {
    // Four-handed: the max bettor folds, but TWO of the three remaining players still have
    // a genuine pending decision. The round must stay open and correctly hand the turn to
    // the next needsAction=true player in seat order rather than being marked complete.
    const state = makeActiveState();
    state.tableId = "table_fold_multiway_pending";
    state.handId = "hand_fold_multiway_pending";
    state.street = "TURN";
    state.potCents = 1100;
    state.roundCurrentBetCents = 500;
    state.minRaiseCents = 100;
    state.toActSeat = 0;
    state.seats.push("u1", "u2", "u3", "u4");

    const folder = makePlayer({
      id: "u1",
      seat: 0,
      roundBetCents: 500,
      committedCents: 500,
      status: "ACTIVE",
      needsAction: true,
    });
    const pendingA = makePlayer({
      id: "u2",
      seat: 1,
      roundBetCents: 300,
      committedCents: 300,
      status: "ACTIVE",
      needsAction: true,
    });
    const pendingB = makePlayer({
      id: "u3",
      seat: 2,
      roundBetCents: 200,
      committedCents: 200,
      status: "ACTIVE",
      needsAction: true,
    });
    const allIn = makePlayer({
      id: "u4",
      seat: 3,
      roundBetCents: 100,
      committedCents: 100,
      stackCents: 0,
      status: "ALL_IN",
      needsAction: false,
    });

    state.playersById.set(folder.id, folder);
    state.playersById.set(pendingA.id, pendingA);
    state.playersById.set(pendingB.id, pendingB);
    state.playersById.set(allIn.id, allIn);
    const actionService = new ActionService({
      state,
      getHeroActionOptions: () => undefined,
      getLastAction: () => undefined,
    });

    const execution = await actionService.execute({
      state,
      userId: folder.id,
      msg: { action: "FOLD" },
      origin: "PLAYER",
      applyActionDebit: vi.fn().mockResolvedValue(undefined),
      recordAcceptedAction: vi.fn().mockResolvedValue(undefined),
      assertCanAfford: () => {},
    });

    expect(execution.result.kind).toBe("TURN_ADVANCED");
    expect(state.toActSeat).toBe(1);
    expect(state.roundCurrentBetCents).toBe(300);
    expect(pendingA.needsAction).toBe(true);
    expect(pendingB.needsAction).toBe(true);
    expect(() => assertStateInvariants(state)).not.toThrow();
  });
});
