import { TABLE } from "@/constants/copy";
import type { Opponent } from "../table.adapter";
import { assertNever } from "../table.adapter";
import { CARDS } from "../opponent-strip/layout";
import { BASE_CARD_WIDTH, BASE_CARD_HEIGHT } from "../tokens/card-dimensions.tokens";

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

/** Scale so two BASE_CARD cards fit in the cell with correct aspect ratio (no crop). */
export function scaleToFillCell(width: number, height: number): number {
  const slotW = width / 2;
  const scaleW = slotW / BASE_CARD_WIDTH;
  const scaleH = height / BASE_CARD_HEIGHT;
  return Math.min(1, scaleW, scaleH);
}

/** Initial scale from min cell so two cards fill before first layout. */
export function initialScale(): number {
  return scaleToFillCell(CARDS.CELL_MIN_WIDTH, CARDS.CELL_MIN_HEIGHT);
}
