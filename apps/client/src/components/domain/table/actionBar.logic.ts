import type { HeroActionOptions } from "@poker-champ/realtime-contract";

export function resolvePrimaryWagerAction(o?: HeroActionOptions): "BET" | "RAISE" | undefined {
  if (!o) return undefined;
  if (o.primaryWagerAction === "BET" || o.primaryWagerAction === "RAISE") return o.primaryWagerAction;
  return undefined;
}

export function buildWagerActionPayload(
  options: HeroActionOptions | undefined,
  amount: number,
): { type: "BET" | "RAISE"; amount: number } | undefined {
  const primary = resolvePrimaryWagerAction(options);
  if (!primary) return undefined;
  return { type: primary, amount };
}

