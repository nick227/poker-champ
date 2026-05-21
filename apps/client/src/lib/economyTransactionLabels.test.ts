import { describe, expect, it } from "vitest";
import { formatEconomyTransactionLabel } from "./economyTransactionLabels";

describe("formatEconomyTransactionLabel", () => {
  it("labels tournament payout clearly", () => {
    expect(formatEconomyTransactionLabel("TOURNAMENT_PAYOUT")).toBe("Tournament payout");
  });

  it("labels tournament entry clearly", () => {
    expect(formatEconomyTransactionLabel("TOURNAMENT_ENTRY")).toBe("Tournament entry");
  });
});
