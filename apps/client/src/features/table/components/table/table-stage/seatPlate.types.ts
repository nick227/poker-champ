import type { UiCard } from "../table.adapter";

export type SeatPlateCards = {
  left?: UiCard;
  right?: UiCard;
  faceDown: boolean;
  visible: boolean;
};
