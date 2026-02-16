import { nanoid } from "nanoid";
import * as bcrypt from "bcryptjs";
import type { TableConfig } from "./types.js";

export function makeTableId(): string {
  return `table_${nanoid(10)}`;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function isPasswordValid(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export async function buildTableConfig(input: {
  name: string;
  maxSeats: number;
  smallBlindCents: number;
  bigBlindCents: number;
  minBuyInCents: number;
  maxBuyInCents: number;
  visibility: "PUBLIC" | "PRIVATE";
  password?: string;
  speed: "normal" | "fast";
}): Promise<TableConfig> {
  const tableId = makeTableId();
  const createdAt = Date.now();
  const passwordHash =
    input.visibility === "PRIVATE"
      ? await hashPassword(input.password ?? "")
      : undefined;

  return {
    tableId,
    name: input.name,
    maxSeats: input.maxSeats,
    smallBlindCents: input.smallBlindCents,
    bigBlindCents: input.bigBlindCents,
    minBuyInCents: input.minBuyInCents,
    maxBuyInCents: input.maxBuyInCents,
    visibility: input.visibility,
    speed: input.speed,
    passwordHash,
    createdAt,
  };
}
