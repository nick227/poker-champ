import type { ActionPayload } from "../../../messages/schemas.js";
import type { PlayerState } from "../../../state/PlayerState.js";
import type { PokerState } from "../../../state/PokerState.js";
import type { TableLastAction } from "@poker-champ/realtime-contract";
import { PokerError } from "../../errors.js";
import {
  allRemainingPlayersAllInOrFolded,
  bettingRoundComplete,
  clearPlayerNeedsAction,
  eligibleToAct,
  noFurtherBettingPossible,
  onNewBetLevel,
  syncRoundCurrentBetCents,
} from "../../rules/BettingRound.js";
import { countNotFoldedPlayers, findNextToActSeat } from "../utils/TableNavigator.js";
import { maybeAssertStateInvariants } from "../../invariants/assertState.js";

type ActionDebitKind = "CALL" | "BET" | "RAISE" | "ALL_IN";
type AcceptedActionKind = "FOLD" | "CHECK" | "CALL" | "BET" | "RAISE" | "ALL_IN";
type LastActionOrigin = TableLastAction["origin"];
type LastActionStreet = TableLastAction["street"];

export type ActionServiceLastAction = Omit<TableLastAction, "seq">;

export type ActionResult =
  | { kind: "HAND_FINISHED" }
  | { kind: "STREET_COMPLETE" }
  | { kind: "TURN_ADVANCED"; actorKind: PlayerState["kind"] }
  | { kind: "WAITING_FOR_PLAYERS" }
  | { kind: "NO_OP" };

export type ActionExecutionResult = {
  result: ActionResult;
  lastAction?: ActionServiceLastAction;
};

export class ActionService {
  private finish(state: PokerState, result: ActionResult): ActionResult {
    maybeAssertStateInvariants(state);
    return result;
  }

  private resolvePostAction(state: PokerState, actorKind: PlayerState["kind"]): ActionResult {
    if (countNotFoldedPlayers(state) <= 1) {
      return this.finish(state, { kind: "HAND_FINISHED" });
    }

    if (allRemainingPlayersAllInOrFolded(state)) {
      state.runoutMode = "STAGED";
      return this.finish(state, { kind: "STREET_COMPLETE" });
    }

    if (bettingRoundComplete(state) || noFurtherBettingPossible(state)) {
      return this.finish(state, { kind: "STREET_COMPLETE" });
    }

    const nextSeat = findNextToActSeat(state, state.toActSeat);
    if (nextSeat === -1) {
      return this.finish(state, { kind: "STREET_COMPLETE" });
    }
    state.toActSeat = nextSeat;
    return this.finish(state, { kind: "TURN_ADVANCED", actorKind });
  }

  private toActionStreet(street: PokerState["street"]): LastActionStreet {
    if (street === "PREFLOP" || street === "FLOP" || street === "TURN" || street === "RIVER") return street;
    throw new PokerError("BAD_STATE", `Cannot build lastAction on street ${street}.`);
  }

  private buildLastAction(params: {
    state: PokerState;
    player: PlayerState;
    action: AcceptedActionKind;
    amountCents: number;
    potAfterCents: number;
    origin: LastActionOrigin;
    raiseToCents?: number;
  }): ActionServiceLastAction {
    const { state, player, action, amountCents, potAfterCents, origin, raiseToCents } = params;
    return {
      handId: state.handId,
      street: this.toActionStreet(state.street),
      actorUserId: player.id,
      actorKind: player.kind,
      action,
      amountCents,
      raiseToCents,
      potAfterCents,
      origin,
      createdAtTs: Date.now(),
    };
  }

  async execute(params: {
    state: PokerState;
    userId: string;
    msg: ActionPayload;
    origin: LastActionOrigin;
    applyActionDebit: (
      p: PlayerState,
      amountCents: number,
      action: ActionDebitKind,
      meta?: Record<string, unknown>,
    ) => Promise<void>;
    recordAcceptedAction: (args: {
      player: PlayerState;
      action: AcceptedActionKind;
      amountCents: number;
      potBeforeCents: number;
      potAfterCents: number;
      meta?: Record<string, unknown>;
    }) => Promise<void>;
    assertCanAfford: (p: PlayerState, amountCents: number) => void;
  }): Promise<ActionExecutionResult> {
    const {
      state,
      userId,
      msg,
      origin,
      applyActionDebit,
      recordAcceptedAction,
      assertCanAfford,
    } = params;
    const player = state.playersById.get(userId);
    if (!player) throw new PokerError("BAD_STATE", "Unknown player.");
    if (state.street === "WAITING") throw new PokerError("HAND_NOT_STARTED", "Hand not started.");
    if (state.runoutMode === "STAGED") throw new PokerError("INVALID_ACTION", "Runout in progress.");
    if (!eligibleToAct(player)) throw new PokerError("NOT_ELIGIBLE", "Player not eligible to act.");
    if (player.seat !== state.toActSeat) throw new PokerError("NOT_YOUR_TURN", "Not your turn.");

    const callAmount = Math.max(0, state.roundCurrentBetCents - player.roundBetCents);
    const potBefore = state.potCents;
    let lastAction: ActionServiceLastAction | undefined;
    const fold = async (): Promise<void> => {
      await recordAcceptedAction({
        player,
        action: "FOLD",
        amountCents: 0,
        potBeforeCents: potBefore,
        potAfterCents: potBefore,
      });
      player.status = "FOLDED";
      clearPlayerNeedsAction(player);
      lastAction = this.buildLastAction({
        state,
        player,
        action: "FOLD",
        amountCents: 0,
        potAfterCents: potBefore,
        origin,
      });
    };

    switch (msg.action) {
      case "FOLD": {
        await fold();
        break;
      }

      case "CHECK": {
        if (callAmount !== 0) throw new PokerError("INVALID_ACTION", "Cannot check; must call/fold/raise.");
        await recordAcceptedAction({
          player,
          action: "CHECK",
          amountCents: 0,
          potBeforeCents: potBefore,
          potAfterCents: potBefore,
        });
        clearPlayerNeedsAction(player);
        lastAction = this.buildLastAction({
          state,
          player,
          action: "CHECK",
          amountCents: 0,
          potAfterCents: potBefore,
          origin,
        });
        break;
      }

      case "CALL": {
        if (callAmount > 0) {
          assertCanAfford(player, callAmount);
          await applyActionDebit(player, callAmount, "CALL");
          await recordAcceptedAction({
            player,
            action: "CALL",
            amountCents: callAmount,
            potBeforeCents: potBefore,
            potAfterCents: potBefore + callAmount,
          });
          lastAction = this.buildLastAction({
            state,
            player,
            action: "CALL",
            amountCents: callAmount,
            potAfterCents: potBefore + callAmount,
            origin,
          });
        } else {
          await recordAcceptedAction({
            player,
            action: "CALL",
            amountCents: 0,
            potBeforeCents: potBefore,
            potAfterCents: potBefore,
          });
          lastAction = this.buildLastAction({
            state,
            player,
            action: "CALL",
            amountCents: 0,
            potAfterCents: potBefore,
            origin,
          });
        }
        clearPlayerNeedsAction(player);
        break;
      }

      case "BET": {
        if (state.roundCurrentBetCents !== 0) throw new PokerError("INVALID_ACTION", "Cannot BET; use RAISE.");
        const requested = msg.amountCents ?? 0;
        const amount = Math.min(requested, player.stackCents);
        if (amount <= 0) throw new PokerError("INVALID_ACTION", "BET requires amountCents > 0.");

        const isAllIn = amount === player.stackCents;
        if (amount < state.bigBlindCents && !isAllIn) {
          throw new PokerError("INVALID_ACTION", "BET below minimum.");
        }

        await applyActionDebit(player, amount, "BET");
        await recordAcceptedAction({
          player,
          action: "BET",
          amountCents: amount,
          potBeforeCents: potBefore,
          potAfterCents: potBefore + amount,
        });
        lastAction = this.buildLastAction({
          state,
          player,
          action: "BET",
          amountCents: amount,
          potAfterCents: potBefore + amount,
          origin,
        });
        state.roundCurrentBetCents = player.roundBetCents;
        state.minRaiseCents = Math.max(state.bigBlindCents, amount);
        onNewBetLevel(state, player.id);
        break;
      }

      case "RAISE": {
        if (state.roundCurrentBetCents === 0) throw new PokerError("INVALID_ACTION", "Cannot RAISE; use BET.");
        const raiseToRequested = msg.amountCents ?? 0;
        if (raiseToRequested <= state.roundCurrentBetCents) {
          throw new PokerError("INVALID_ACTION", "RAISE must be > current bet.");
        }

        const neededRequested = Math.max(0, raiseToRequested - player.roundBetCents);
        const needed = Math.min(neededRequested, player.stackCents);
        const raiseTo = player.roundBetCents + needed;
        const delta = raiseTo - state.roundCurrentBetCents;
        const isAllIn = needed === player.stackCents;

        if (delta < state.minRaiseCents && !isAllIn) {
          throw new PokerError("INVALID_ACTION", "RAISE below minRaise.");
        }

        if (needed <= 0) throw new PokerError("INVALID_ACTION", "RAISE requires chips.");
        await applyActionDebit(player, needed, "RAISE", { raiseTo });
        await recordAcceptedAction({
          player,
          action: "RAISE",
          amountCents: needed,
          potBeforeCents: potBefore,
          potAfterCents: potBefore + needed,
          meta: { raiseTo },
        });
        lastAction = this.buildLastAction({
          state,
          player,
          action: "RAISE",
          amountCents: needed,
          raiseToCents: raiseTo,
          potAfterCents: potBefore + needed,
          origin,
        });
        const newLevel = player.roundBetCents;
        state.minRaiseCents = Math.max(state.minRaiseCents, newLevel - state.roundCurrentBetCents);
        state.roundCurrentBetCents = Math.max(state.roundCurrentBetCents, newLevel);
        onNewBetLevel(state, player.id);
        break;
      }

      case "ALL_IN": {
        const pay = player.stackCents;
        if (pay <= 0) throw new PokerError("INVALID_ACTION", "No chips to go all-in.");

        const prevRoundCurrentBet = state.roundCurrentBetCents;
        const prevMinRaise = state.minRaiseCents;
        await applyActionDebit(player, pay, "ALL_IN");
        await recordAcceptedAction({
          player,
          action: "ALL_IN",
          amountCents: pay,
          potBeforeCents: potBefore,
          potAfterCents: potBefore + pay,
        });
        lastAction = this.buildLastAction({
          state,
          player,
          action: "ALL_IN",
          amountCents: pay,
          potAfterCents: potBefore + pay,
          origin,
        });
        if (player.roundBetCents > prevRoundCurrentBet) {
          const delta = player.roundBetCents - prevRoundCurrentBet;
          state.roundCurrentBetCents = player.roundBetCents;
          if (delta >= prevMinRaise) {
            state.minRaiseCents = Math.max(state.minRaiseCents, delta);
            onNewBetLevel(state, player.id);
          } else {
            clearPlayerNeedsAction(player);
          }
        } else {
          clearPlayerNeedsAction(player);
        }

        player.status = "ALL_IN";
        break;
      }
    }

    return {
      result: this.resolvePostAction(state, player.kind),
      lastAction,
    };
  }

  async executeForcedFold(params: {
    state: PokerState;
    userId: string;
    origin: LastActionOrigin;
    recordAcceptedAction: (args: {
      player: PlayerState;
      action: "FOLD";
      amountCents: number;
      potBeforeCents: number;
      potAfterCents: number;
      meta?: Record<string, unknown>;
    }) => Promise<void>;
  }): Promise<ActionExecutionResult> {
    const { state, userId, origin, recordAcceptedAction } = params;
    const player = state.playersById.get(userId);
    if (!player) return { result: this.finish(state, { kind: "NO_OP" }) };
    if (state.street === "WAITING") return { result: this.finish(state, { kind: "NO_OP" }) };
    if (state.runoutMode === "STAGED") return { result: this.finish(state, { kind: "NO_OP" }) };
    if (player.status !== "ACTIVE") return { result: this.finish(state, { kind: "NO_OP" }) };

    const potBefore = state.potCents;
    await recordAcceptedAction({
      player,
      action: "FOLD",
      amountCents: 0,
      potBeforeCents: potBefore,
      potAfterCents: potBefore,
    });
    player.status = "FOLDED";
    clearPlayerNeedsAction(player);
    syncRoundCurrentBetCents(state);
    const lastAction = this.buildLastAction({
      state,
      player,
      action: "FOLD",
      amountCents: 0,
      potAfterCents: potBefore,
      origin,
    });

    if (countNotFoldedPlayers(state) <= 1) {
      return { result: this.finish(state, { kind: "HAND_FINISHED" }), lastAction };
    }

    if (allRemainingPlayersAllInOrFolded(state)) {
      state.runoutMode = "STAGED";
      return { result: this.finish(state, { kind: "STREET_COMPLETE" }), lastAction };
    }

    if (bettingRoundComplete(state) || noFurtherBettingPossible(state)) {
      return { result: this.finish(state, { kind: "STREET_COMPLETE" }), lastAction };
    }

    if (state.toActSeat === player.seat) {
      const nextSeat = findNextToActSeat(state, player.seat);
      if (nextSeat === -1) {
        return { result: this.finish(state, { kind: "STREET_COMPLETE" }), lastAction };
      }
      state.toActSeat = nextSeat;
    }
    return {
      result: this.finish(state, { kind: "TURN_ADVANCED", actorKind: player.kind }),
      lastAction,
    };
  }
}
