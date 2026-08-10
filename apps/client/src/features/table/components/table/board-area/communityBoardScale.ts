import { BASE_CARD_HEIGHT, BASE_CARD_WIDTH } from "../tokens/card-dimensions.tokens";
import { CARDS } from "./layout";

/** Scale community cards to fill a board safe-zone (norm-projected) box. */
export function communityBoardScaleForBox(
  maxWidth: number,
  maxHeight: number,
  gap: number,
  cardCount: number = 5,
  minimumScale: number = 0.65,
): number {
  if (!(maxWidth > 0) || !(maxHeight > 0)) {
    return CARDS.SCALE_LANDSCAPE;
  }
  // A shallow desktop stage must preserve space between the top seat, pot,
  // board, and hero. Taller boxes can spend more of their height on cards.
  const cardBudgetH = maxHeight * (maxHeight < 220 ? 0.82 : 0.88);
  const cardBudgetW = maxWidth * 0.98;
  // Reserve the full five-card row from the flop onward. Card dimensions must
  // not jump or shrink as turn and river arrive.
  const dealtCount = Math.max(1, Math.min(5, Math.round(cardCount)));
  const reservedCount = dealtCount >= 3 ? 5 : dealtCount;
  const scaleW =
    (cardBudgetW - Math.max(0, reservedCount - 1) * gap) /
    (reservedCount * BASE_CARD_WIDTH);
  const scaleH = cardBudgetH / BASE_CARD_HEIGHT;
  const scale = Math.min(scaleW, scaleH);
  // On shallow laptop stages, cap the board just enough to preserve a clean
  // gap to the south hand. It remains substantially larger than player cards.
  const maxScale = maxHeight < 160 ? 1.05 : maxHeight < 280 ? 1.75 : 2.5;
  return Math.max(minimumScale, Math.min(maxScale, scale));
}
