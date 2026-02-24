import { serviceRegistry } from "@/registry/service.registry";

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
    showStats: input.showStats ?? true,
    speed: "normal" as const,
  };

  const res = await serviceRegistry.post.joinTable(payload);
  if (!res.ok) throw new Error(res.error.message);
  return res.data;
}
