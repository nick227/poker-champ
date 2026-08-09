import type { HeroStatus, UiCard } from "../table.adapter";
import type { CardFacePackId } from "@/assets/cards/packs";
import type { SeatPlateProps } from "./SeatPlate";

export function buildHeroPlate(params: {
  userName?: string;
  userId?: string;
  seat?: number;
  stackDisplay: string;
  avatarUrl?: string | null;
  cards: UiCard[];
  heroStatus: HeroStatus;
  isDealer?: boolean;
  isActiveTurn?: boolean;
  isWinner?: boolean;
  cardFacePackId: CardFacePackId;
  statusLabel?: string | null;
  betDisplay?: string | null;
  turnProgress?: number | null;
}): SeatPlateProps {
  const name = params.userName?.trim() || "You";
  const left = params.cards[0] ?? null;
  const right = params.cards[1] ?? null;
  const hasCards = left != null || right != null;
  const inactive =
    params.heroStatus === "FOLDED" ||
    params.heroStatus === "SITTING_OUT" ||
    params.heroStatus === "RECONNECTING";

  return {
    name,
    stackDisplay: params.stackDisplay,
    avatarUrl: params.avatarUrl,
    userId: params.userId,
    seat: params.seat,
    isDealer: params.isDealer,
    isActiveTurn: params.isActiveTurn,
    inactive,
    statusLabel:
      params.statusLabel ??
      (params.heroStatus === "FOLDED"
        ? "Fold"
        : params.heroStatus === "SITTING_OUT"
          ? "Sitting out"
          : params.heroStatus === "RECONNECTING"
            ? "Reconnecting"
            : params.isWinner
              ? "Winner"
              : null),
    cards: hasCards
      ? {
          left: left ?? undefined,
          right: right ?? undefined,
          faceDown: false,
          visible: true,
        }
      : undefined,
    cardFacePackId: params.cardFacePackId,
    betDisplay: params.betDisplay ?? null,
    turnProgress: params.turnProgress ?? null,
  };
}
