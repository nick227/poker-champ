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
  turnCountdownSeconds?: number | null;
  activeGift?: { emoji: string } | null;
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
    // Nameplate stays name + stack only. Action prompts ("to call") live on felt announce.
    statusLabel:
      params.statusLabel ??
      (params.heroStatus === "ALL_IN"
        ? "All in"
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
    isWinner: params.isWinner ?? false,
    turnProgress: params.turnProgress ?? null,
    turnCountdownSeconds: params.turnCountdownSeconds ?? null,
    activeGift: params.activeGift ?? null,
  };
}
