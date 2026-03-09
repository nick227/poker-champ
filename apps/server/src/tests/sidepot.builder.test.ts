import { describe, it, expect } from "vitest";
import { buildSidePots, type SidePot } from "../engine/rules/SidePotManager.js";
import { PlayerState } from "../state/PlayerState.js";

type Status = "ACTIVE" | "FOLDED" | "ALL_IN" | "ABANDONED" | "OUT";

function p(id: string, committedCents: number, status: Status = "ACTIVE"): PlayerState {
  const ps = new PlayerState();
  ps.id = id;
  ps.committedCents = committedCents;
  ps.status = status;
  return ps;
}

function totalCommitted(players: PlayerState[]): number {
  return players
    .filter((x) => x.committedCents > 0 && x.status !== "OUT")
    .reduce((sum, x) => sum + x.committedCents, 0);
}

/** Invariant 1: Total of all side pots == sum(committedCents of all contributors). */
function assertPotPartitioning(playersAll: PlayerState[], pots: SidePot[]): void {
  const totalInPots = pots.reduce((sum, pot) => sum + pot.amountCents, 0);
  const totalCommittedSum = totalCommitted(playersAll);
  expect(totalInPots).toBe(totalCommittedSum);
}

/** Invariant 2: For pot at threshold T, eligible = players where committedCents >= T AND not FOLDED/ABANDONED. */
function assertEligibility(playersAll: PlayerState[], eligibleAtShowdown: PlayerState[], pots: SidePot[]): void {
  const eligibleIdSet = new Set(eligibleAtShowdown.map((x) => x.id));
  const committedById = new Map(playersAll.map((x) => [x.id, x.committedCents]));

  for (const pot of pots) {
    const expected = playersAll
      .filter((x) => x.committedCents >= pot.levelCents && eligibleIdSet.has(x.id))
      .map((x) => x.id)
      .sort();
    expect([...pot.eligiblePlayerIds].sort()).toEqual(expected);
  }
}

/** Invariant 3: Side pots sorted ascending by threshold. */
function assertOrdering(pots: SidePot[]): void {
  for (let i = 1; i < pots.length; i++) {
    expect(pots[i].levelCents).toBeGreaterThanOrEqual(pots[i - 1].levelCents);
  }
}

/** Invariant 4: No player can win from a pot whose threshold exceeds their committedCents. */
function assertIsolation(playersAll: PlayerState[], pots: SidePot[]): void {
  const committedById = new Map(playersAll.map((x) => [x.id, x.committedCents]));
  for (const pot of pots) {
    for (const id of pot.eligiblePlayerIds) {
      const committed = committedById.get(id) ?? 0;
      expect(committed).toBeGreaterThanOrEqual(pot.levelCents);
    }
  }
}

function assertAllInvariants(
  playersAll: PlayerState[],
  eligibleAtShowdown: PlayerState[],
  pots: SidePot[],
): void {
  assertPotPartitioning(playersAll, pots);
  assertEligibility(playersAll, eligibleAtShowdown, pots);
  assertOrdering(pots);
  assertIsolation(playersAll, pots);
}

describe("side-pot builder invariants", () => {
  it("Invariant 1: pot partitioning — total pots == total committed", () => {
    const A = p("A", 200);
    const B = p("B", 200);
    const pots = buildSidePots([A, B], [A, B]);
    assertPotPartitioning([A, B], pots);
    expect(pots.reduce((s, pot) => s + pot.amountCents, 0)).toBe(400);
  });

  it("Invariant 2: eligibility at threshold T = committed >= T and not folded", () => {
    const A = p("A", 100, "ALL_IN");
    const B = p("B", 200, "ACTIVE");
    const C = p("C", 200, "FOLDED");
    const pots = buildSidePots([A, B, C], [A, B]);
    assertEligibility([A, B, C], [A, B], pots);
  });

  it("Invariant 3: pots sorted ascending by threshold", () => {
    const A = p("A", 50);
    const B = p("B", 200);
    const C = p("C", 200);
    const pots = buildSidePots([A, B, C], [A, B, C]);
    assertOrdering(pots);
    expect(pots.map((x) => x.levelCents)).toEqual([50, 200]);
  });

  it("Invariant 4: no player wins from pot above their commitment", () => {
    const A = p("A", 100, "ALL_IN");
    const B = p("B", 300, "ALL_IN");
    const C = p("C", 500, "ALL_IN");
    const pots = buildSidePots([A, B, C], [A, B, C]);
    assertIsolation([A, B, C], pots);
  });
});

describe("side-pot builder cases", () => {
  it("two players, no all-in → single pot", () => {
    const A = p("A", 200);
    const B = p("B", 200);
    const pots = buildSidePots([A, B], [A, B]);
    expect(pots.length).toBe(1);
    expect(pots[0].levelCents).toBe(200);
    expect(pots[0].amountCents).toBe(400);
    expect(pots[0].eligiblePlayerIds.sort()).toEqual(["A", "B"]);
    assertAllInvariants([A, B], [A, B], pots);
  });

  it("three players, one short all-in", () => {
    const A = p("A", 100, "ALL_IN");
    const B = p("B", 200);
    const C = p("C", 200);
    const pots = buildSidePots([A, B, C], [A, B, C]);
    expect(pots.length).toBe(2);
    expect(pots[0].levelCents).toBe(100);
    expect(pots[0].amountCents).toBe(300);
    expect(pots[0].eligiblePlayerIds.sort()).toEqual(["A", "B", "C"]);
    expect(pots[1].levelCents).toBe(200);
    expect(pots[1].amountCents).toBe(200);
    expect(pots[1].eligiblePlayerIds.sort()).toEqual(["B", "C"]);
    assertAllInvariants([A, B, C], [A, B, C], pots);
  });

  it("four players, two different all-ins", () => {
    const A = p("A", 50, "ALL_IN");
    const B = p("B", 100, "ALL_IN");
    const C = p("C", 200);
    const D = p("D", 200);
    const pots = buildSidePots([A, B, C, D], [A, B, C, D]);
    expect(pots.length).toBe(3);
    expect(pots[0].levelCents).toBe(50);
    expect(pots[0].amountCents).toBe(200);
    expect(pots[0].eligiblePlayerIds.sort()).toEqual(["A", "B", "C", "D"]);
    expect(pots[1].levelCents).toBe(100);
    expect(pots[1].amountCents).toBe(150);
    expect(pots[1].eligiblePlayerIds.sort()).toEqual(["B", "C", "D"]);
    expect(pots[2].levelCents).toBe(200);
    expect(pots[2].amountCents).toBe(200);
    expect(pots[2].eligiblePlayerIds.sort()).toEqual(["C", "D"]);
    assertAllInvariants([A, B, C, D], [A, B, C, D], pots);
  });

  it("folded player with committed chips", () => {
    const A = p("A", 200, "ACTIVE");
    const B = p("B", 200, "FOLDED");
    const C = p("C", 200, "ACTIVE");
    const pots = buildSidePots([A, B, C], [A, C]);
    expect(pots.length).toBe(1);
    expect(pots[0].amountCents).toBe(600);
    expect(pots[0].eligiblePlayerIds.sort()).toEqual(["A", "C"]);
    assertAllInvariants([A, B, C], [A, C], pots);
  });

  it("tie in main pot, single winner side pot", () => {
    const A = p("A", 200, "ALL_IN");
    const B = p("B", 200, "ALL_IN");
    const C = p("C", 500, "ALL_IN");
    const pots = buildSidePots([A, B, C], [A, B, C]);
    expect(pots.length).toBe(2);
    expect(pots[0].levelCents).toBe(200);
    expect(pots[0].amountCents).toBe(600);
    expect(pots[0].eligiblePlayerIds.sort()).toEqual(["A", "B", "C"]);
    expect(pots[1].levelCents).toBe(500);
    expect(pots[1].amountCents).toBe(300);
    expect(pots[1].eligiblePlayerIds.sort()).toEqual(["C"]);
    assertAllInvariants([A, B, C], [A, B, C], pots);
  });

  it("tie across multiple side pots", () => {
    const A = p("A", 100, "ALL_IN");
    const B = p("B", 200, "ALL_IN");
    const C = p("C", 200, "ALL_IN");
    const pots = buildSidePots([A, B, C], [A, B, C]);
    expect(pots.length).toBe(2);
    expect(pots[0].levelCents).toBe(100);
    expect(pots[0].eligiblePlayerIds.sort()).toEqual(["A", "B", "C"]);
    expect(pots[1].levelCents).toBe(200);
    expect(pots[1].eligiblePlayerIds.sort()).toEqual(["B", "C"]);
    assertAllInvariants([A, B, C], [A, B, C], pots);
  });

  it("throws when a money-bearing side pot has no eligible winners", () => {
    const A = p("A", 100, "ALL_IN");
    const B = p("B", 200, "ALL_IN");
    const C = p("C", 200, "ALL_IN");

    expect(() => buildSidePots([A, B, C], [A])).toThrow(/SIDE_POT_WITH_NO_ELIGIBLE_WINNERS/);
  });

  it("throws when eligibleAtShowdown is empty but committed chips exist", () => {
    const A = p("A", 100, "ALL_IN");
    const B = p("B", 200, "ALL_IN");
    const C = p("C", 300, "ALL_IN");

    expect(() => buildSidePots([A, B, C], [])).toThrow(/SIDE_POT_WITH_NO_ELIGIBLE_WINNERS/);
  });
});
