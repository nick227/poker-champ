import { describe, expect, it, vi } from "vitest";
import { ActionService } from "./ActionService.js";
import { assertStateInvariants } from "../../invariants/assertState.js";
import { PokerState } from "../../../state/PokerState.js";
import { PlayerState } from "../../../state/PlayerState.js";

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
  const state = new PokerState();
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
  const actionService = new ActionService();
  const { state, actor } = makeStateAndActor();

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
    const actionService = new ActionService();
    const state = new PokerState();
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
});
