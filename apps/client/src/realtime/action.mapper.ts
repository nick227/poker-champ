import { nanoid } from "nanoid";
import type { TableActionKey } from "@/registry/table-action.registry";
import type { TableAction } from "@poker-champ/realtime-contract";

const actionToServerAction: Record<TableActionKey, TableAction> = {
  fold: "FOLD",
  check: "CHECK",
  call: "CALL",
  bet: "BET",
  raise: "RAISE",
  allIn: "ALL_IN",
};

export function toServerActionPayload(input: { action: TableActionKey; amountCents?: number }) {
  return {
    action: actionToServerAction[input.action],
    ...(typeof input.amountCents === "number" ? { amountCents: input.amountCents } : {}),
    actionId: nanoid(12),
  };
}
