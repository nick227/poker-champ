import { PokerError } from "../errors.js";
import type { PokerState } from "../../state/PokerState.js";

export type MoneyInvariantActorSnapshot = {
  userId: string;
  stackCentsBefore: number;
  stackCentsAfter: number;
  roundBetCentsBefore: number;
  roundBetCentsAfter: number;
};

export type MoneyInvariantTransitionInput = {
  event:
    | "POST_BLIND"
    | "ACTION_DEBIT"
    | "STREET_SETTLE"
    | "SHOWDOWN_PAYOUT"
    | "UNCALLED_RETURN";
  actionType: string;
  actorUserId?: string;
  street: PokerState["street"];
  state: PokerState;
  potCentsBefore: number;
  potCentsAfter: number;
  totalStacksBeforeCents: number;
  totalStacksAfterCents: number;
  potDisbursedCentsBefore?: number;
  potDisbursedCentsAfter?: number;
  expectedPotDeltaCents?: number;
  expectedMassDeltaCents?: number;
  actor?: MoneyInvariantActorSnapshot;
  expectedActorStackDeltaCents?: number;
  expectedActorRoundBetDeltaCents?: number;
};

function failWithDump(
  reason: string,
  input: MoneyInvariantTransitionInput,
  details?: Record<string, number | string | undefined>,
): never {
  const dump = {
    event: input.event,
    actionType: input.actionType,
    actorUserId: input.actorUserId,
    street: input.street,
    actor: input.actor,
    potBeforeAfter: {
      before: input.potCentsBefore,
      after: input.potCentsAfter,
    },
    state: {
      roundCurrentBetCents: input.state.roundCurrentBetCents,
      minRaiseCents: input.state.minRaiseCents,
      toActSeat: input.state.toActSeat,
    },
    details,
  };

  throw new PokerError("BAD_STATE", `${reason} | ${JSON.stringify(dump)}`);
}

function sumRoundBets(state: PokerState): number {
  let sum = 0;
  for (const player of state.playersById.values()) {
    sum += player.roundBetCents;
  }
  return sum;
}

export function assertMoneyConservationTransition(input: MoneyInvariantTransitionInput): void {
  for (const player of input.state.playersById.values()) {
    if (player.stackCents < 0) {
      failWithDump("player.stackCents must be >= 0", input, { offendingValue: player.stackCents, seat: player.seat });
    }
    if (player.roundBetCents < 0) {
      failWithDump("player.roundBetCents must be >= 0", input, { offendingValue: player.roundBetCents, seat: player.seat });
    }
  }
  if (input.state.potCents < 0) {
    failWithDump("state.potCents must be >= 0", input, { offendingValue: input.state.potCents });
  }

  const roundBetSum = sumRoundBets(input.state);
  if (input.state.potCents < roundBetSum) {
    failWithDump("state.potCents cannot be less than sum(player.roundBetCents)", input, {
      potCents: input.state.potCents,
      roundBetSum,
    });
  }

  const actualPotDelta = input.potCentsAfter - input.potCentsBefore;
  if (input.expectedPotDeltaCents != null && actualPotDelta !== input.expectedPotDeltaCents) {
    failWithDump("pot delta mismatch", input, {
      expectedPotDeltaCents: input.expectedPotDeltaCents,
      actualPotDeltaCents: actualPotDelta,
    });
  }

  if (input.actor) {
    const stackDelta = input.actor.stackCentsAfter - input.actor.stackCentsBefore;
    const roundBetDelta = input.actor.roundBetCentsAfter - input.actor.roundBetCentsBefore;
    if (input.expectedActorStackDeltaCents != null && stackDelta !== input.expectedActorStackDeltaCents) {
      failWithDump("actor stack delta mismatch", input, {
        expectedActorStackDeltaCents: input.expectedActorStackDeltaCents,
        actualActorStackDeltaCents: stackDelta,
      });
    }
    if (input.expectedActorRoundBetDeltaCents != null && roundBetDelta !== input.expectedActorRoundBetDeltaCents) {
      failWithDump("actor roundBet delta mismatch", input, {
        expectedActorRoundBetDeltaCents: input.expectedActorRoundBetDeltaCents,
        actualActorRoundBetDeltaCents: roundBetDelta,
      });
    }
  }

  const disbursedBefore = input.potDisbursedCentsBefore ?? 0;
  const disbursedAfter = input.potDisbursedCentsAfter ?? disbursedBefore;
  const massBefore = input.totalStacksBeforeCents + input.potCentsBefore - disbursedBefore;
  const massAfter = input.totalStacksAfterCents + input.potCentsAfter - disbursedAfter;
  const actualMassDelta = massAfter - massBefore;
  const expectedMassDelta = input.expectedMassDeltaCents ?? 0;
  if (actualMassDelta !== expectedMassDelta) {
    failWithDump("table money mass delta mismatch", input, {
      expectedMassDeltaCents: expectedMassDelta,
      actualMassDeltaCents: actualMassDelta,
      massBefore,
      massAfter,
      disbursedBefore,
      disbursedAfter,
    });
  }
}
