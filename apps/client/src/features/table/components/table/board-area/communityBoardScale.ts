import { BASE_CARD_HEIGHT, BASE_CARD_WIDTH } from "../tokens/card-dimensions.tokens";
import { CARDS } from "./layout";

/** Scale community cards to fill a board safe-zone (norm-projected) box. */
export function communityBoardScaleForBox(
  maxWidth: number,
  maxHeight: number,
  gap: number,
): number {
  if (!(maxWidth > 0) || !(maxHeight > 0)) {
    return CARDS.SCALE_LANDSCAPE;
  }
  // Leave ~24% of height for pot pill — cards own the rest.
  const cardBudgetH = maxHeight * 0.76;
  const cardBudgetW = maxWidth * 0.98;
  const scaleW = (cardBudgetW - 4 * gap) / (5 * BASE_CARD_WIDTH);
  const scaleH = cardBudgetH / BASE_CARD_HEIGHT;
  const scale = Math.min(scaleW, scaleH);
  return Math.max(0.95, Math.min(1.9, scale));
}
