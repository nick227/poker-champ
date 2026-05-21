import { describe, expect, it } from "vitest";
import { formatEconomyTransactionLabel } from "./economyTransactionLabels";

describe("formatEconomyTransactionLabel", () => {
  it("labels tournament payout clearly", () => {
    expect(formatEconomyTransactionLabel("TOURNAMENT_PAYOUT")).toBe("Tournament payout");
  });

  it("labels tournament entry clearly", () => {
    expect(formatEconomyTransactionLabel("TOURNAMENT_ENTRY")).toBe("Tournament entry");
  });

  it("labels all tournament economy transaction types", () => {
    expect(formatEconomyTransactionLabel("TOURNAMENT_SEAT")).toBe("Tournament seat");
    expect(formatEconomyTransactionLabel("TOURNAMENT_BUST")).toBe("Tournament bust");
    expect(formatEconomyTransactionLabel("REFUND")).toBe("Refund");
  });
});
