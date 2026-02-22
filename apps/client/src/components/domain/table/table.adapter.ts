import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";

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

function getResolvedHeroSeat(snapshot: TableSnapshotPayload) {
  const bySeat =
    snapshot.hero.seat == null
      ? undefined
      : snapshot.seats.find((s) => s.seat === snapshot.hero.seat);
  if (bySeat) return bySeat;
  if (!snapshot.hero.youAreSeated || !snapshot.hero.userId) return undefined;
  return snapshot.seats.find((s) => s.occupied && s.userId === snapshot.hero.userId);
}

export function getHeroStackCents(snapshot: TableSnapshotPayload): number {
  const seat = getResolvedHeroSeat(snapshot);
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

function getSeatOpponentStatus(
  seat: { connected?: boolean; disconnectDeadlineTs?: number; status?: string },
  serverNowTs?: number,
): Opponent["status"] {
  const now = serverNowTs ?? Date.now();
  const deadline = seat.disconnectDeadlineTs ?? 0;
  if (!seat.connected) {
    return now < deadline ? "reconnecting" : "sittingOut";
  }
  if (seat.status === "ABANDONED" || seat.status === "OUT") return "sittingOut";
  return SEAT_STATUS_TO_OPPONENT[seat.status ?? ""] ?? "active";
}

export type SeatDisplayStatus =
  | "ACTIVE"
  | "FOLDED"
  | "ALL_IN"
  | "SITTING_OUT"
  | "RECONNECTING";

export type HeroStatus = SeatDisplayStatus;

export function assertNever(x: never): never {
  throw new Error("Unhandled SeatDisplayStatus: " + String(x));
}

/** Opponent status maps 1:1 to SeatDisplayStatus (lowercase/camel). */
export type OpponentDisplayStatus = "active" | "folded" | "allIn" | "sittingOut" | "reconnecting";

export type Opponent = {
  id: string;
  name: string;
  stackCents: number;
  isDealer?: boolean;
  isActive?: boolean;
  isBot?: boolean;
  status?: OpponentDisplayStatus;
  actionLabel?: string;
  cards?: {
    left?: UiCard;
    right?: UiCard;
    faceDown: boolean;
    visible: boolean;
  };
};

/** Hero display status: uses connected + disconnectDeadlineTs for Reconnecting… vs Sitting out. */
export function getHeroDisplayStatus(snapshot: TableSnapshotPayload): SeatDisplayStatus {
  const heroSeat = getResolvedHeroSeat(snapshot);
  if (!heroSeat) return "SITTING_OUT";
  const now = snapshot.serverTimeTs ?? Date.now();
  const deadline = heroSeat.disconnectDeadlineTs ?? 0;
  if (!heroSeat.connected) {
    return now < deadline ? "RECONNECTING" : "SITTING_OUT";
  }
  const s = heroSeat.status;
  if (s === "WAITING") return "ACTIVE";
  if (s === "OUT" || s === "ABANDONED") return "SITTING_OUT";
  return s as SeatDisplayStatus;
}

export function getIsMyTurn(snapshot: TableSnapshotPayload): boolean {
  const hand = snapshot.hand;
  const heroSeat = getResolvedHeroSeat(snapshot);
  if (!hand || !heroSeat) return false;
  return hand.toActSeat === heroSeat.seat;
}

export function getIsDealer(snapshot: TableSnapshotPayload): boolean {
  if (!snapshot.hand) return false;
  const heroSeat = getResolvedHeroSeat(snapshot);
  if (!heroSeat) return false;
  return heroSeat.seat === snapshot.hand.dealerSeat;
}

export function mapSeatsToOpponents(snapshot: TableSnapshotPayload): Opponent[] {
  const showdownHoleCardsByUserId =
    snapshot.lastHandResult?.reason === "SHOWDOWN"
      ? snapshot.lastHandResult.showdownHoleCardsByUserId
      : undefined;

  const heroId = snapshot.hero.userId;
  const serverNowTs = snapshot.serverTimeTs;
  return snapshot.seats
    .filter((seat) => seat.occupied && seat.userId && seat.userId !== heroId)
    .map((seat) => ({
      id: seat.userId!,
      name: seat.name || "Player",
      stackCents: seat.stackCents,
      isDealer: seat.seat === snapshot.hand?.dealerSeat,
      isActive: seat.isToAct,
      isBot: seat.isBot ?? false,
      status: getSeatOpponentStatus(seat, serverNowTs),
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
