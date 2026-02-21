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
import { maybeAssertBettingState } from "../../invariants/assertBettingState.js";
import { maybeAssertStateInvariants } from "../../invariants/assertState.js";

export type ActionDebitKind = "CALL" | "BET" | "RAISE" | "ALL_IN";
export type AcceptedActionKind = "FOLD" | "CHECK" | "CALL" | "BET" | "RAISE" | "ALL_IN";
type LastActionOrigin = TableLastAction["origin"];
type LastActionStreet = TableLastAction["street"];

// ActionService builds action payload fields; Dealer owns monotonic seq assignment.
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

function resolveHeroTraceUserId(): string | null {
  const value = process.env.HERO_TRACE_USER_ID?.trim();
  return value && value.length > 0 ? value : null;
}

function shouldTraceUser(userId: string): boolean {
  const heroTraceUserId = resolveHeroTraceUserId();
  return !heroTraceUserId || heroTraceUserId === userId;
}

function traceHero(event: string, payload: Record<string, unknown>): void {
  try {
    console.log(`[HERO_TRACE] ${event} ${JSON.stringify(payload)}`);
  } catch {
    console.log(`[HERO_TRACE] ${event}`);
  }
}

export class ActionService {
  private tracePostAction(state: PokerState, player: PlayerState, action: string, potBefore: number): void {
    if (!shouldTraceUser(player.id)) return;
    traceHero("ACTION_POST_STATE", {
      tableId: state.tableId,
      handId: state.handId,
      userId: player.id,
      seat: player.seat,
      action,
      street: state.street,
      stackCents: player.stackCents,
      roundBetCents: player.roundBetCents,
      committedCents: player.committedCents,
      status: player.status,
      potBeforeCents: potBefore,
      potAfterCents: state.potCents,
      roundCurrentBetCents: state.roundCurrentBetCents,
      minRaiseCents: state.minRaiseCents,
      toActSeat: state.toActSeat,
      actionCount: state.actionCount,
      handActionSeq: state.handActionSeq,
    });
  }

  private finish(state: PokerState, result: ActionResult): ActionResult {
    // HAND_FINISHED can be a transient pre-settlement state where betting invariants need not hold.
    if (result.kind !== "HAND_FINISHED") maybeAssertBettingState(state);
    maybeAssertStateInvariants(state);
    return result;
  }

  private resolvePostAction(
    state: PokerState,
    actorKind: PlayerState["kind"],
    opts?: { skipTurnAdvance?: boolean },
  ): ActionResult {
    if (countNotFoldedPlayers(state) <= 1) {
      return this.finish(state, { kind: "HAND_FINISHED" });
    }

    // All-in runout takes precedence over normal street completion.
    if (allRemainingPlayersAllInOrFolded(state)) {
      for (const p of state.playersById.values()) clearPlayerNeedsAction(p);
      state.runoutMode = "STAGED";
      return this.finish(state, { kind: "STREET_COMPLETE" });
    }

    if (bettingRoundComplete(state) || noFurtherBettingPossible(state)) {
      return this.finish(state, { kind: "STREET_COMPLETE" });
    }

    if (opts?.skipTurnAdvance) {
      return this.finish(state, { kind: "TURN_ADVANCED", actorKind });
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

  private async applyFold(params: {
    state: PokerState;
    player: PlayerState;
    potBeforeCents: number;
    origin: LastActionOrigin;
    recordAcceptedAction: (args: {
      player: PlayerState;
      action: "FOLD";
      amountCents: number;
      potBeforeCents: number;
      potAfterCents: number;
      meta?: Record<string, unknown>;
    }) => Promise<void>;
  }): Promise<ActionServiceLastAction> {
    const { state, player, potBeforeCents, origin, recordAcceptedAction } = params;
    await recordAcceptedAction({
      player,
      action: "FOLD",
      amountCents: 0,
      potBeforeCents,
      potAfterCents: potBeforeCents,
    });
    player.status = "FOLDED";
    clearPlayerNeedsAction(player);
    syncRoundCurrentBetCents(state);
    return this.buildLastAction({
      state,
      player,
      action: "FOLD",
      amountCents: 0,
      potAfterCents: potBeforeCents,
      origin,
    });
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
    if (countNotFoldedPlayers(state) <= 1) {
      throw new PokerError("HAND_ALREADY_FINISHED", "Hand is over; only one player remains.");
    }

    const callAmount = Math.max(0, state.roundCurrentBetCents - player.roundBetCents);
    const potBefore = state.potCents;
    let lastAction: ActionServiceLastAction | undefined;
    const assertPotAfter = (expectedPotCents: number, context: string): void => {
      if (process.env.NODE_ENV === "production") return;
      // applyActionDebit must synchronously update state.potCents.
      if (state.potCents !== expectedPotCents) {
        throw new PokerError("BAD_STATE", `${context}: potCents mismatch (expected ${expectedPotCents}, got ${state.potCents}).`);
      }
    };
    switch (msg.action) {
      case "FOLD": {
        lastAction = await this.applyFold({
          state,
          player,
          potBeforeCents: potBefore,
          origin,
          recordAcceptedAction,
        });
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
        syncRoundCurrentBetCents(state);
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
        if (callAmount === 0) {
          throw new PokerError("INVALID_ACTION", "Nothing to call; use CHECK.");
        }
        const effectiveCallCents = Math.min(callAmount, player.stackCents);
        assertCanAfford(player, effectiveCallCents);
        await applyActionDebit(player, effectiveCallCents, "CALL");
        assertPotAfter(potBefore + effectiveCallCents, "CALL");
        await recordAcceptedAction({
          player,
          action: "CALL",
          amountCents: effectiveCallCents,
          potBeforeCents: potBefore,
          potAfterCents: potBefore + effectiveCallCents,
        });
        lastAction = this.buildLastAction({
          state,
          player,
          action: "CALL",
          amountCents: effectiveCallCents,
          potAfterCents: potBefore + effectiveCallCents,
          origin,
        });
        clearPlayerNeedsAction(player);
        syncRoundCurrentBetCents(state);
        break;
      }

      case "BET": {
        if (state.roundCurrentBetCents !== 0) throw new PokerError("INVALID_ACTION", "Cannot BET; use RAISE.");
        const requested = msg.amountCents ?? 0;
        const amount = Math.min(requested, player.stackCents);
        if (amount <= 0) throw new PokerError("INVALID_ACTION", "BET requires amountCents > 0.");

        const isAllIn = amount === player.stackCents;
        if (amount < state.minRaiseCents && !isAllIn) {
          throw new PokerError("INVALID_ACTION", "BET below minimum.");
        }

        await applyActionDebit(player, amount, "BET");
        assertPotAfter(potBefore + amount, "BET");
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
        const maxRaiseTo = player.roundBetCents + player.stackCents;
        if (raiseToRequested > maxRaiseTo) {
          throw new PokerError("INVALID_ACTION", "RAISE exceeds max reachable bet.");
        }

        const neededRequested = Math.max(0, raiseToRequested - player.roundBetCents);
        const needed = neededRequested;
        const raiseTo = player.roundBetCents + needed;
        const delta = raiseTo - state.roundCurrentBetCents;
        const isAllIn = needed === player.stackCents;
        if (shouldTraceUser(player.id)) {
          traceHero("HERO_RAISE_MATH", {
            tableId: state.tableId,
            handId: state.handId,
            userId: player.id,
            seat: player.seat,
            street: state.street,
            raiseToRequested,
            playerRoundBetCentsBefore: player.roundBetCents,
            roundCurrentBetCentsBefore: state.roundCurrentBetCents,
            maxRaiseTo,
            neededRequested,
            neededApplied: needed,
            raiseToApplied: raiseTo,
            raiseDeltaCents: delta,
            minRaiseCentsBefore: state.minRaiseCents,
            isAllIn,
          });
        }

        if (delta < state.minRaiseCents && !isAllIn) {
          throw new PokerError("INVALID_ACTION", "RAISE below minRaise.");
        }

        if (needed <= 0) throw new PokerError("INVALID_ACTION", "RAISE requires chips.");
        await applyActionDebit(player, needed, "RAISE", { raiseTo });
        assertPotAfter(potBefore + needed, "RAISE");
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
          // amountCents is chips added by this action; raiseToCents is the actor's new total round bet.
          amountCents: needed,
          raiseToCents: raiseTo,
          potAfterCents: potBefore + needed,
          origin,
        });
        const newLevel = player.roundBetCents;
        const raiseSize = newLevel - state.roundCurrentBetCents;
        state.roundCurrentBetCents = newLevel;
        state.minRaiseCents = Math.max(state.minRaiseCents, raiseSize);
        onNewBetLevel(state, player.id);
        break;
      }

      case "ALL_IN": {
        const pay = player.stackCents;
        if (pay <= 0) throw new PokerError("INVALID_ACTION", "No chips to go all-in.");

        const prevRoundCurrentBet = state.roundCurrentBetCents;
        const prevMinRaise = state.minRaiseCents;
        await applyActionDebit(player, pay, "ALL_IN");
        assertPotAfter(potBefore + pay, "ALL_IN");
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
        player.status = "ALL_IN";
        if (player.stackCents !== 0) {
          throw new PokerError("BAD_STATE", `ALL_IN must leave zero stack (got ${player.stackCents}).`);
        }
        if (player.roundBetCents > prevRoundCurrentBet) {
          const delta = player.roundBetCents - prevRoundCurrentBet;
          state.roundCurrentBetCents = player.roundBetCents;
          if (delta >= prevMinRaise) {
            state.minRaiseCents = Math.max(state.minRaiseCents, delta);
            onNewBetLevel(state, player.id);
          } else {
            // Short all-in does not meet minRaise, so action is not reopened for players
            // who already acted at the current bet level (correct poker rules).
            clearPlayerNeedsAction(player);
          }
        } else {
          clearPlayerNeedsAction(player);
        }
        break;
      }
    }
    if (lastAction) this.tracePostAction(state, player, lastAction.action, potBefore);

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
    const lastAction = await this.applyFold({
      state,
      player,
      origin,
      potBeforeCents: potBefore,
      recordAcceptedAction,
    });

    let skipTurnAdvance = false;
    if (state.toActSeat === player.seat) {
      const nextSeat = findNextToActSeat(state, player.seat);
      if (nextSeat !== -1) {
        state.toActSeat = nextSeat;
        skipTurnAdvance = true;
      }
    }

    return {
      result: this.resolvePostAction(state, player.kind, { skipTurnAdvance }),
      lastAction,
    };
  }
}
