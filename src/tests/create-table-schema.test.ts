import { describe, expect, it } from "vitest";
import { CreateTableSchema } from "@poker-champ/realtime-contract";

describe("CreateTableSchema", () => {
  const validBase = {
    name: "Hold'em",
    maxSeats: 6,
    smallBlindCents: 10,
    bigBlindCents: 20,
    minBuyInCents: 500,
    maxBuyInCents: 2000,
    visibility: "PUBLIC" as const,
    speed: "normal" as const,
  };

  it("accepts valid $0.10/$0.20 config with min <= max buy-in", () => {
    const result = CreateTableSchema.safeParse(validBase);
    expect(result.success).toBe(true);
  });

  it("rejects when minBuyInCents > maxBuyInCents", () => {
    const result = CreateTableSchema.safeParse({
      ...validBase,
      minBuyInCents: 100000,
      maxBuyInCents: 2000,
    });
    expect(result.success).toBe(false);
  });

  it("rejects when bigBlindCents < smallBlindCents", () => {
    const result = CreateTableSchema.safeParse({
      ...validBase,
      smallBlindCents: 100,
      bigBlindCents: 50,
    });
    expect(result.success).toBe(false);
  });

  it("rejects PRIVATE visibility without password", () => {
    const result = CreateTableSchema.safeParse({
      ...validBase,
      visibility: "PRIVATE",
      password: undefined,
    });
    expect(result.success).toBe(false);
  });

  it("accepts PRIVATE visibility with password", () => {
    const result = CreateTableSchema.safeParse({
      ...validBase,
      visibility: "PRIVATE",
      password: "secret",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid $1/$2 config with 100 BB max", () => {
    const result = CreateTableSchema.safeParse({
      ...validBase,
      smallBlindCents: 100,
      bigBlindCents: 200,
      minBuyInCents: 4000,
      maxBuyInCents: 20000,
    });
    expect(result.success).toBe(true);
  });
});
