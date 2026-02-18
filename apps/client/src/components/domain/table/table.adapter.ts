import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import type { Opponent } from "./OpponentStrip";

export type UiCard = { rank: string; suit: string } | null;

export function decodeCard(card: string | undefined): UiCard {
  if (!card || card.length < 2) return null;
  const raw = String(card).trim();
  if (raw.length < 2) return null;
  const suit = raw.slice(-1).toLowerCase();
  let rank = raw.slice(0, -1).toUpperCase();
  if (rank === "10") rank = "T";
  return { rank, suit };
}

export function getCommunityCards(snapshot: TableSnapshotPayload): UiCard[] {
  const board = snapshot.hand?.board ?? snapshot.lastHandResult?.board ?? [];
  const cards = board.map((c) => decodeCard(c));
  while (cards.length < 5) cards.push(null);
  return cards.slice(0, 5);
}

export function getHeroCards(snapshot: TableSnapshotPayload): UiCard[] {
  const raw = snapshot.hero.holeCards ?? [];
  const cards = raw.map((c) => decodeCard(c));
  while (cards.length < 2) cards.push(null);
  return cards.slice(0, 2);
}

export function getHeroStackCents(snapshot: TableSnapshotPayload): number {
  if (snapshot.hero.seat == null) return 0;
  const seat = snapshot.seats.find((s) => s.seat === snapshot.hero.seat);
  return seat?.stackCents ?? 0;
}

export function getPotCents(snapshot: TableSnapshotPayload): number {
  return snapshot.hand?.potCents ?? snapshot.lastHandResult?.potCents ?? 0;
}

const SEAT_STATUS_TO_OPPONENT: Record<string, Opponent["status"]> = {
  FOLDED: "folded",
  ALL_IN: "allIn",
  OUT: "sittingOut",
  ABANDONED: "sittingOut",
  ACTIVE: "active",
  WAITING: "active",
};

export type HeroStatus = "ACTIVE" | "FOLDED" | "ALL_IN" | "OUT" | "ABANDONED";

export function getHeroStatus(snapshot: TableSnapshotPayload): HeroStatus {
  if (!snapshot.hero.youAreSeated || snapshot.hero.seat == null) return "OUT";
  const heroSeat = snapshot.seats.find((s) => s.seat === snapshot.hero.seat);
  if (!heroSeat) return "OUT";
  const s = heroSeat.status;
  if (s === "WAITING") return "ACTIVE";
  return s as HeroStatus;
}

export function getIsMyTurn(snapshot: TableSnapshotPayload): boolean {
  const hand = snapshot.hand;
  if (!hand || snapshot.hero.seat == null) return false;
  return hand.toActSeat === snapshot.hero.seat;
}

export function getIsDealer(snapshot: TableSnapshotPayload): boolean {
  if (!snapshot.hero.youAreSeated || !snapshot.hand) return false;
  return snapshot.hero.seat === snapshot.hand.dealerSeat;
}

export function mapSeatsToOpponents(snapshot: TableSnapshotPayload): Opponent[] {
  const showdownHoleCardsByUserId =
    snapshot.lastHandResult?.reason === "SHOWDOWN"
      ? snapshot.lastHandResult.showdownHoleCardsByUserId
      : undefined;

  const heroId = snapshot.hero.userId;
  return snapshot.seats
    .filter((seat) => seat.occupied && seat.userId && seat.userId !== heroId)
    .map((seat) => ({
      id: seat.userId!,
      name: seat.name || "Player",
      stackCents: seat.stackCents,
      isDealer: seat.seat === snapshot.hand?.dealerSeat,
      isActive: seat.isToAct,
      isBot: seat.isBot ?? false,
      status: SEAT_STATUS_TO_OPPONENT[seat.status] ?? "active",
      cards: (() => {
        if (snapshot.hand) {
          const isInHand = seat.status === "ACTIVE" || seat.status === "FOLDED" || seat.status === "ALL_IN";
          if (!isInHand) return undefined;
          return { faceDown: true, visible: true };
        }

        const showdownCards = showdownHoleCardsByUserId?.[seat.userId!];
        if (!showdownCards) return undefined;

        return {
          left: decodeCard(showdownCards[0]),
          right: decodeCard(showdownCards[1]),
          faceDown: false,
          visible: true,
        };
      })(),
    }));
}
