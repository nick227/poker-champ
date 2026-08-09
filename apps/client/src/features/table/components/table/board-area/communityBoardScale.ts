import { BASE_CARD_HEIGHT, BASE_CARD_WIDTH } from "../tokens/card-dimensions.tokens";
import { CARDS } from "./layout";

/** Scale community cards to fill a board safe-zone (norm-projected) box. */
export function communityBoardScaleForBox(
  maxWidth: number,
  maxHeight: number,
  gap: number,
): number {
  if (!(maxWidth > 0) || !(maxHeight > 0)) {
    return CARDS.SCALE;
  }
  // Leave ~32% of height for pot pill + margins.
  const cardBudgetH = maxHeight * 0.68;
  const cardBudgetW = maxWidth * 0.96;
  const scaleW = (cardBudgetW - 4 * gap) / (5 * BASE_CARD_WIDTH);
  const scaleH = cardBudgetH / BASE_CARD_HEIGHT;
  const scale = Math.min(scaleW, scaleH);
  return Math.max(0.72, Math.min(1.65, scale));
}
