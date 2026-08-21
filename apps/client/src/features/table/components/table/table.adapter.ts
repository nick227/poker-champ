import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";

export type UiCard = { rank: string; suit: string } | null;
type SeatLike = TableSnapshotPayload["seats"][number];

export type SeatContext = {
  heroSeat?: SeatLike;
  occupiedCount: number;
  nameByUserId: Map<string, string>;
};

function decodeCard(card: string | undefined): UiCard {
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
  const cards = board.map((c: string) => decodeCard(c));
  while (cards.length < 5) cards.push(null);
  return cards.slice(0, 5);
}

export function getHeroCards(snapshot: TableSnapshotPayload): UiCard[] {
  const raw = snapshot.hero.holeCards ?? [];
  const cards = raw.map((c: string) => decodeCard(c));
  while (cards.length < 2) cards.push(null);
  return cards.slice(0, 2);
}

export function buildSeatContext(snapshot: TableSnapshotPayload): SeatContext {
  const nameByUserId = new Map<string, string>();
  let heroSeatBySeat: SeatLike | undefined;
  let heroSeatByUserId: SeatLike | undefined;
  let occupiedCount = 0;
  const heroSeatNo = snapshot.hero.seat;
  const heroUserId = snapshot.hero.userId;
  const shouldResolveByUserId = Boolean(snapshot.hero.youAreSeated && heroUserId != null);

  for (const seat of snapshot.seats) {
    if (seat.occupied) occupiedCount += 1;

    if (seat.userId != null) {
      nameByUserId.set(String(seat.userId), seat.name || "Player");
    }

    if (heroSeatNo != null && seat.seat === heroSeatNo) {
      heroSeatBySeat = seat;
    }

    if (
      !heroSeatByUserId &&
      shouldResolveByUserId &&
      seat.occupied &&
      seat.userId != null &&
      seat.userId === heroUserId
    ) {
      heroSeatByUserId = seat;
    }
  }

  return {
    heroSeat: heroSeatBySeat ?? heroSeatByUserId,
    occupiedCount,
    nameByUserId,
  };
}

function getResolvedHeroSeat(snapshot: TableSnapshotPayload, seatContext?: SeatContext) {
  if (seatContext?.heroSeat) return seatContext.heroSeat;
  return buildSeatContext(snapshot).heroSeat;
}

export function getHeroStackCents(snapshot: TableSnapshotPayload, seatContext?: SeatContext): number {
  const seat = getResolvedHeroSeat(snapshot, seatContext);
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

function isHandResultSettled(snapshot: TableSnapshotPayload): boolean {
  if (!snapshot.hand) return true;
  const resultHandId = snapshot.lastHandResult?.handId;
  return resultHandId != null && resultHandId === snapshot.hand.handId;
}

function getSeatOpponentStatus(
  seat: {
    connected?: boolean;
    disconnectDeadlineTs?: number;
    status?: string;
    stackCents?: number;
  },
  serverNowTs?: number,
  handActive = true,
): Opponent["status"] {
  if (!seat.connected) {
    if (seat.status === "ABANDONED" || seat.status === "OUT") return "sittingOut";
    const deadline = seat.disconnectDeadlineTs ?? 0;
    if (deadline <= 0 || serverNowTs == null) return "reconnecting";
    return serverNowTs < deadline ? "reconnecting" : "sittingOut";
  }
  if (seat.status === "ABANDONED" || seat.status === "OUT") return "sittingOut";
  // After payout / between hands: never keep All-In/Folded chrome — show stack (or busted).
  if (!handActive) {
    if ((seat.stackCents ?? 0) <= 0) return "sittingOut";
    return "active";
  }
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
  seat: number;
  id: string;
  name: string;
  stackCents: number;
  isDealer?: boolean;
  isActive?: boolean;
  isBot?: boolean;
  status?: OpponentDisplayStatus;
  actionLabel?: string;
  roundBetCents?: number;
  avatarUrl?: string;
  cards?: {
    left?: UiCard;
    right?: UiCard;
    faceDown: boolean;
    visible: boolean;
  };
  activeGift?: { emoji: string } | null;
};

/** Hero display status: uses connected + disconnectDeadlineTs for Reconnecting… vs Sitting out. */
export function getHeroDisplayStatus(snapshot: TableSnapshotPayload, seatContext?: SeatContext): SeatDisplayStatus {
  const heroSeat = getResolvedHeroSeat(snapshot, seatContext);
  if (!heroSeat) return "SITTING_OUT";
  if (!heroSeat.connected) {
    const s = heroSeat.status;
    if (s === "OUT" || s === "ABANDONED") return "SITTING_OUT";
    const deadline = heroSeat.disconnectDeadlineTs ?? 0;
    if (deadline <= 0) return "SITTING_OUT";
    const now = snapshot.serverTimeTs;
    if (now == null) return "RECONNECTING";
    return now < deadline ? "RECONNECTING" : "SITTING_OUT";
  }
  const s = heroSeat.status;
  if (s === "OUT" || s === "ABANDONED") return "SITTING_OUT";
  // After payout (and between hands): All-In/Folded are hand-scoped — show stack or busted.
  if (isHandResultSettled(snapshot)) {
    if (s === "ALL_IN" || s === "FOLDED" || s === "ACTIVE" || s === "WAITING") {
      return heroSeat.stackCents > 0 ? "ACTIVE" : "SITTING_OUT";
    }
  }
  if (s === "WAITING") return "ACTIVE";
  return s as SeatDisplayStatus;
}

export function getIsMyTurn(snapshot: TableSnapshotPayload, seatContext?: SeatContext): boolean {
  if (isHandResultSettled(snapshot)) return false;
  const hand = snapshot.hand;
  const heroSeat = getResolvedHeroSeat(snapshot, seatContext);
  if (!hand || !heroSeat) return false;
  return hand.toActSeat === heroSeat.seat;
}

export function getIsDealer(snapshot: TableSnapshotPayload, seatContext?: SeatContext): boolean {
  if (!snapshot.hand) return false;
  const heroSeat = getResolvedHeroSeat(snapshot, seatContext);
  if (!heroSeat) return false;
  return heroSeat.seat === snapshot.hand.dealerSeat;
}

export function mapSeatsToOpponents(snapshot: TableSnapshotPayload): Opponent[] {
  const showdownHoleCardsByUserId =
    snapshot.lastHandResult?.reason === "SHOWDOWN"
      ? snapshot.lastHandResult.showdownHoleCardsByUserId
      : undefined;
  const heroId = snapshot.hero.userId;
  const heroSeatNumber = snapshot.hero.seat;
  const serverNowTs = snapshot.serverTimeTs;
  const opponents: Opponent[] = [];
  for (const seat of snapshot.seats) {
    if (!seat.occupied || !seat.userId) continue;
    if (heroSeatNumber != null) {
      if (seat.seat === heroSeatNumber) continue;
    } else if (seat.userId === heroId) {
      continue;
    }

    let cards: Opponent["cards"] | undefined;
    const showdownCards = showdownHoleCardsByUserId?.[seat.userId];
    if (showdownCards) {
      cards = {
        left: decodeCard(showdownCards[0]),
        right: decodeCard(showdownCards[1]),
        faceDown: false,
        visible: true,
      };
    } else if (snapshot.hand) {
      const isInHand = seat.status === "ACTIVE" || seat.status === "FOLDED" || seat.status === "ALL_IN";
      if (isInHand) cards = { faceDown: true, visible: true };
    }

    let actionLabel: string | undefined;
    const hand = snapshot.hand;
    const lastAction = snapshot.lastAction;
    if (hand && lastAction && hand.handId === lastAction.handId && lastAction.actorUserId === seat.userId && hand.street === lastAction.street) {
      if (lastAction.action === "FOLD") actionLabel = "Fold";
      else if (lastAction.action === "CHECK") actionLabel = "Check";
      else if (lastAction.action === "CALL") actionLabel = "Call";
      else if (lastAction.action === "BET") actionLabel = "Bet";
      else if (lastAction.action === "RAISE") actionLabel = "Raise";
      else if (lastAction.action === "ALL_IN") actionLabel = "All-In";
    }

    opponents.push({
      seat: seat.seat,
      id: seat.userId,
      name: seat.name || "Player",
      stackCents: seat.stackCents,
      isDealer: seat.seat === snapshot.hand?.dealerSeat,
      isActive: isHandResultSettled(snapshot) ? false : seat.isToAct,
      isBot: seat.isBot ?? false,
      status: getSeatOpponentStatus(seat, serverNowTs, !isHandResultSettled(snapshot)),
      actionLabel,
      ...(seat.roundBetCents > 0 ? { roundBetCents: seat.roundBetCents } : {}),
      ...(seat.avatarUrl && { avatarUrl: seat.avatarUrl }),
      cards,
    });
  }
  const heroSeat = snapshot.hero.seat;
  const maxSeats = snapshot.table?.maxSeats ?? snapshot.seats.length;

  if (heroSeat != null && maxSeats > 0) {
    opponents.sort((a, b) => {
      const aKey = (a.seat - heroSeat + maxSeats) % maxSeats;
      const bKey = (b.seat - heroSeat + maxSeats) % maxSeats;
      return aKey - bKey;
    });
  }

  return opponents;
}
