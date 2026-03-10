import { TABLE } from "@/constants/copy";
import type { Opponent } from "../table.adapter";
import { assertNever } from "../table.adapter";

export function getStatusLabel(status: Opponent["status"]): string | null {
  if (status == null) return null;
  switch (status) {
    case "active":
      return null;
    case "folded":
      return TABLE.fold;
    case "allIn":
      return "All in";
    case "sittingOut":
      return TABLE.sittingOut;
    case "reconnecting":
      return TABLE.reconnecting;
    default:
      return assertNever(status);
  }
}
