import { describe, expect, it } from "vitest";
import { ActionOptionsService } from "./ActionOptionsService.js";
import { PlayerState } from "../../../state/PlayerState.js";
import { PokerState } from "../../../state/PokerState.js";

function makeState(): PokerState {
  const state = new PokerState();
  state.street = "PREFLOP";
  state.runoutMode = "NONE";
  state.bigBlindCents = 100;
  state.minRaiseCents = 100;
  state.roundCurrentBetCents = 0;
  state.toActSeat = 0;
  state.seats.push("u1", "u2");
  return state;
}

function makePlayer(input: {
  id: string;
  seat: number;
  stackCents: number;
  roundBetCents?: number;
  status?: PlayerState["status"];
}): PlayerState {
  const p = new PlayerState();
  p.id = input.id;
  p.userId = input.id;
  p.kind = "HUMAN";
  p.name = input.id;
  p.seat = input.seat;
  p.status = input.status ?? "ACTIVE";
  p.stackCents = input.stackCents;
  p.roundBetCents = input.roundBetCents ?? 0;
  p.committedCents = 0;
  p.needsAction = true;
  p.connected = true;
  return p;
}

describe("ActionOptionsService", () => {
  const service = new ActionOptionsService();

  it("enforces canBet XOR canRaise on hero turn", () => {
    const state = makeState();
    const hero = makePlayer({ id: "u1", seat: 0, stackCents: 1_000, roundBetCents: 0 });
    state.playersById.set(hero.id, hero);

    const preflopOpen = service.buildHeroActionOptions(state, hero.id)!;
    expect(preflopOpen.canBet).toBe(true);
    expect(preflopOpen.canRaise).toBe(false);
    expect(preflopOpen.primaryWagerAction).toBe("BET");

    state.roundCurrentBetCents = 200;
    state.minRaiseCents = 100;
    hero.roundBetCents = 100;

    const facingBet = service.buildHeroActionOptions(state, hero.id)!;
    expect(facingBet.canBet).toBe(false);
    expect(facingBet.canRaise).toBe(true);
    expect(facingBet.primaryWagerAction).toBe("RAISE");
  });

  it("hides call and wager bounds when hero is not to act", () => {
    const state = makeState();
    state.toActSeat = 1;
    state.roundCurrentBetCents = 200;
    state.minRaiseCents = 100;
    const hero = makePlayer({ id: "u1", seat: 0, stackCents: 2_000, roundBetCents: 100 });
    state.playersById.set(hero.id, hero);

    const options = service.buildHeroActionOptions(state, hero.id)!;
    expect(options.canFold).toBe(false);
    expect(options.canCall).toBe(false);
    expect(options.canBet).toBe(false);
    expect(options.canRaise).toBe(false);
    expect(options.callAmount).toBe(0);
    expect(options.primaryWagerAction).toBe("NONE");
    expect(options.minRaiseTo).toBeUndefined();
    expect(options.maxRaiseTo).toBeUndefined();
  });

  it("publishes canonical wager bounds for open-bet and raise spots", () => {
    const state = makeState();
    const hero = makePlayer({ id: "u1", seat: 0, stackCents: 150, roundBetCents: 0 });
    state.playersById.set(hero.id, hero);

    const open = service.buildHeroActionOptions(state, hero.id)!;
    expect(open.canBet).toBe(true);
    expect(open.primaryWagerAction).toBe("BET");
    expect(open.minRaiseTo).toBe(100);
    expect(open.maxRaiseTo).toBe(150);

    state.roundCurrentBetCents = 200;
    state.minRaiseCents = 100;
    hero.roundBetCents = 100;
    hero.stackCents = 500;

    const raise = service.buildHeroActionOptions(state, hero.id)!;
    expect(raise.canRaise).toBe(true);
    expect(raise.primaryWagerAction).toBe("RAISE");
    expect(raise.minRaiseTo).toBe(300);
    expect(raise.maxRaiseTo).toBe(600);
  });

  it("allows call and sets callAmount to min(rawCall, stack) when facing overbet (e.g. all-in)", () => {
    const state = makeState();
    state.roundCurrentBetCents = 5_000;
    state.minRaiseCents = 100;
    const hero = makePlayer({ id: "u1", seat: 0, stackCents: 800, roundBetCents: 0 });
    state.playersById.set(hero.id, hero);

    const options = service.buildHeroActionOptions(state, hero.id)!;
    expect(options.canCall).toBe(true);
    expect(options.callAmount).toBe(800);
  });
});
