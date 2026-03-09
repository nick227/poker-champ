import { serviceRegistry } from "@/registry/service.registry";
import type { InstantGamePresetId } from "@/components/domain/lobby/instantGame.presets";

type CreateTableInput = {
  name?: string;
  maxSeats: number;
  smallBlindCents: number;
  bigBlindCents: number;
  minBuyInCents: number;
  maxBuyInCents: number;
  visibility?: "PUBLIC" | "PRIVATE";
  password?: string;
  showStats?: boolean;
};

export async function postCreateTable(input: CreateTableInput) {
  const payload = {
    name: input.name?.trim() || "Hold'em",
    maxSeats: input.maxSeats,
    smallBlindCents: input.smallBlindCents,
    bigBlindCents: input.bigBlindCents,
    minBuyInCents: input.minBuyInCents,
    maxBuyInCents: input.maxBuyInCents,
    visibility: input.visibility ?? "PUBLIC",
    password: input.visibility === "PRIVATE" ? input.password : undefined,
    showStats: input.showStats ?? false,
    speed: "normal" as const,
  };

  const res = await serviceRegistry.post.joinTable(payload);
  if (!res.ok) throw new Error(res.error.message);
  return res.data;
}

export async function postCreateInstantGame(input: {
  presetId: InstantGamePresetId;
  config: CreateTableInput;
  targetBotCount?: number;
}) {
  const payload = {
    presetId: input.presetId,
    targetBotCount: typeof input.targetBotCount === "number" ? input.targetBotCount : undefined,
    config: {
      name: input.config.name?.trim() || "Hold'em",
      maxSeats: input.config.maxSeats,
      smallBlindCents: input.config.smallBlindCents,
      bigBlindCents: input.config.bigBlindCents,
      minBuyInCents: input.config.minBuyInCents,
      maxBuyInCents: input.config.maxBuyInCents,
      visibility: input.config.visibility ?? "PUBLIC" as const,
      password: input.config.visibility === "PRIVATE" ? input.config.password : undefined,
      showStats: input.config.showStats ?? false,
    },
  };

  const res = await serviceRegistry.post.instantGame(payload);
  if (!res.ok) throw new Error(res.error.message);
  return res.data;
}
