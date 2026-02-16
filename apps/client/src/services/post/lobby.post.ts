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
  const res = await serviceRegistry.post.joinTable(input);
  if (!res.ok) throw new Error(res.error.message);
  return res.data;
}
