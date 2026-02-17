import { serviceRegistry } from "@/registry/service.registry";

type CreateTableInput = {
  name?: string;
  maxSeats: number;
  smallBlindCents?: number;
  bigBlindCents?: number;
  minBuyInCents?: number;
  maxBuyInCents?: number;
  visibility?: "PUBLIC" | "PRIVATE";
  password?: string;
  speed: "normal" | "fast";
};

export async function postCreateTable(input: CreateTableInput) {
  const payload = {
    name: input.name?.trim() || "Hold'em",
    maxSeats: input.maxSeats,
    smallBlindCents: input.smallBlindCents ?? 100,
    bigBlindCents: input.bigBlindCents ?? 200,
    minBuyInCents: input.minBuyInCents ?? 2000,
    maxBuyInCents: input.maxBuyInCents ?? 20000,
    visibility: input.visibility ?? "PUBLIC",
    password: input.visibility === "PRIVATE" ? input.password : undefined,
    speed: input.speed,
  };

  const res = await serviceRegistry.post.joinTable(payload);
  if (!res.ok) throw new Error(res.error.message);
  return res.data;
}
