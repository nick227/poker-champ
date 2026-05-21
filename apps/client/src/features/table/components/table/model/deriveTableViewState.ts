import type { HeroActionOptions, TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { CANONICAL_LESSON_SNAPSHOT_VERSION } from "@poker-champ/realtime-contract";
import type { ConnectionStatus } from "../table.types";
import { TABLE } from "@/constants/copy";
import { formatCents } from "@/lib/format";
import {
  buildSeatContext,
  getCommunityCards,
  getHeroCards,
  getHeroDisplayStatus,
  getHeroStackCents,
  getIsDealer,
  getIsMyTurn,
  getPotCents,
} from "../table.adapter";
import { getActionContext, type ActionContext } from "../action-bar/actionBar.logic";

export type TableRenderPhase =
  | "WAITING"
  | "PREFLOP"
  | "FLOP"
  | "TURN"
  | "RIVER"
  | "SHOWDOWN";

export type TableViewState = {
  phase: TableRenderPhase;
  street: TableRenderPhase;
  handId: string | null;
  completedHandId: string | null;
  board: ReturnType<typeof getCommunityCards>;
  seats: TableSnapshotPayload["seats"];
  potCents: number;
  heroTurn: boolean;
  heroPrompt: string | null;
  passiveMessage: string | null;
  turnCue: boolean;
  actionsInteractive: boolean;
  boardResetEligible: boolean;
  connectionLabel: string | null;
  handSummary?: { street: string; potCents: number };
  actionContext: ActionContext;
  canAct: boolean;
  heroStatus: ReturnType<typeof getHeroDisplayStatus>;
  communityCards: ReturnType<typeof getCommunityCards>;
  heroCards: ReturnType<typeof getHeroCards>;
  heroStackCents: number;
  heroActionOptions?: HeroActionOptions;
  heroCalculations: TableSnapshotPayload["hero"]["calculations"];
  heroPlayerStats: TableSnapshotPayload["hero"]["playerStats"];
  heroName?: string;
  heroAvatarUrl?: string;
  heroUserId: string | null;
  heroSeat: number | null;
  isHeroToAct: boolean;
  isHeroWinner: boolean;
  isHeroDealer: boolean;
  tableName: string;
  playerCount: number;
  maxSeats: number;
  blinds?: { smallBlindCents: number; bigBlindCents: number };
};

export const YOUR_MOVE_COPY = "Your move";
export const ALL_IN_COPY = "All-in";
const RECONNECTING_COPY = "Reconnecting...";
const DISCONNECTED_COPY = "Disconnected...";

function mergeCallWithStack(
  actionOptions: HeroActionOptions | undefined,
  snapshot: TableSnapshotPayload,
  isMyTurn: boolean,
  heroStackCents: number,
  heroRoundBetCents: number,
): HeroActionOptions | undefined {
  if (!actionOptions || !isMyTurn || !snapshot.hand) return actionOptions;
  const roundCurrentBetCents = snapshot.hand.roundCurrentBetCents ?? 0;
  const rawCallAmount = Math.max(0, roundCurrentBetCents - heroRoundBetCents);
  const derivedCanCallWithStack = rawCallAmount > 0 && heroStackCents > 0;
  if (!derivedCanCallWithStack) return actionOptions;
  if (actionOptions.canCall && (actionOptions.callAmount ?? 0) > 0) return actionOptions;
  const callAmount = Math.min(rawCallAmount, heroStackCents);
  return { ...actionOptions, canCall: true, callAmount };
}

function deriveFullActionOptionsFromSnapshot(
  snapshot: TableSnapshotPayload,
  heroStackCents: number,
  heroRoundBetCents: number,
): HeroActionOptions {
  const hand = snapshot.hand;
  const roundCurrentBetCents = hand?.roundCurrentBetCents ?? 0;
  const canCheck = roundCurrentBetCents === heroRoundBetCents;
  const callAmount = Math.max(0, roundCurrentBetCents - heroRoundBetCents);
  const canCall = callAmount > 0 && heroStackCents > 0;
  const canBet = roundCurrentBetCents === 0 && heroStackCents > 0;
  const canRaise = roundCurrentBetCents > 0 && heroStackCents > 0;
  return {
    canFold: true,
    canCheck,
    canCall,
    canBet,
    canRaise,
    canAllIn: heroStackCents > 0,
    primaryWagerAction: canBet ? "BET" : canRaise ? "RAISE" : "NONE",
    callAmount: canCall ? Math.min(callAmount, heroStackCents) : 0,
    minRaiseTo: undefined,
    maxRaiseTo: undefined,
  };
}

function expandOptionsWithFullLegal(
  actionOptions: HeroActionOptions | undefined,
  snapshot: TableSnapshotPayload,
  heroStackCents: number,
  heroRoundBetCents: number,
): HeroActionOptions | undefined {
  if (!actionOptions || !snapshot.hand) return actionOptions;
  const full = deriveFullActionOptionsFromSnapshot(snapshot, heroStackCents, heroRoundBetCents);
  const mergedCanCall = actionOptions.canCall || full.canCall;
  const shouldRepairCallAmount = mergedCanCall && (actionOptions.callAmount ?? 0) <= 0;
  return {
    ...actionOptions,
    canFold: actionOptions.canFold || full.canFold,
    canCheck: actionOptions.canCheck || full.canCheck,
    canCall: mergedCanCall,
    canBet: actionOptions.canBet || full.canBet,
    canRaise: actionOptions.canRaise || full.canRaise,
    canAllIn: actionOptions.canAllIn || full.canAllIn,
    callAmount: shouldRepairCallAmount ? full.callAmount : (actionOptions.callAmount ?? full.callAmount),
    primaryWagerAction: actionOptions.primaryWagerAction !== "NONE" ? actionOptions.primaryWagerAction : full.primaryWagerAction,
  };
}

function fillWagerBoundsFromSnapshot(
  actionOptions: HeroActionOptions | undefined,
  snapshot: TableSnapshotPayload,
  heroStackCents: number,
  heroRoundBetCents: number,
): HeroActionOptions | undefined {
  if (!actionOptions || !snapshot.hand) return actionOptions;
  const hasBounds = actionOptions.minRaiseTo != null && actionOptions.maxRaiseTo != null;
  if (hasBounds) return actionOptions;
  const primary = actionOptions.primaryWagerAction;
  let needBet = primary === "BET" && actionOptions.canBet;
  if (!needBet && !(primary === "RAISE" && actionOptions.canRaise)) {
    if (actionOptions.canBet || actionOptions.canRaise) {
      needBet = actionOptions.canBet;
    } else {
      return actionOptions;
    }
  }

  const { hand, table } = snapshot;
  const roundCurrentBetCents = hand.roundCurrentBetCents ?? 0;
  const minRaiseCents = hand.minRaiseCents ?? 0;
  const bigBlindCents = table?.bigBlindCents ?? 100;

  const useBet = needBet;
  const minRaiseTo = useBet ? bigBlindCents : roundCurrentBetCents + minRaiseCents;
  const maxRaiseTo = useBet ? heroStackCents : heroRoundBetCents + heroStackCents;
  if (minRaiseTo <= 0 || maxRaiseTo < minRaiseTo) return actionOptions;
  const primaryWagerAction = useBet ? "BET" : "RAISE";
  return { ...actionOptions, minRaiseTo, maxRaiseTo, primaryWagerAction };
}

function getTransportMessage(connectionStatus: ConnectionStatus | undefined): string | null {
  if (connectionStatus === "RECONNECTING") return RECONNECTING_COPY;
  if (connectionStatus === "DISCONNECTED") return DISCONNECTED_COPY;
  return null;
}

function getShortName(name: string | null | undefined): string {
  const trimmed = name?.trim() ?? "";
  if (!trimmed) return "Player";
  const [firstToken] = trimmed.split(/\s+/);
  return firstToken || "Player";
}

function buildHeroPrompt(
  isHeroToAct: boolean,
  actionOptions: HeroActionOptions | undefined,
): string | null {
  if (!isHeroToAct) return null;
  if (!actionOptions) return YOUR_MOVE_COPY;
  if (actionOptions.canCall && (actionOptions.callAmount ?? 0) > 0) {
    return `${formatCents(actionOptions.callAmount)} to call`;
  }
  if (actionOptions.canCheck) return "Check";
  if (actionOptions.canAllIn && !actionOptions.canBet && !actionOptions.canRaise) return ALL_IN_COPY;
  if (actionOptions.primaryWagerAction === "RAISE" && actionOptions.canRaise) return "Raise";
  if (actionOptions.primaryWagerAction === "BET" && actionOptions.canBet) return "Bet";
  if (actionOptions.canAllIn) return ALL_IN_COPY;
  return YOUR_MOVE_COPY;
}

function buildPassiveMessage(snapshot: TableSnapshotPayload): string {
  const hand = snapshot.hand;
  if (!hand) {
    const heroUserId = snapshot.hero.userId ?? null;
    const occupiedOpponents = snapshot.seats.filter(
      (seat) => seat.occupied && seat.userId !== heroUserId,
    );
    const activeOpponents = occupiedOpponents.filter((seat) => (seat.stackCents ?? 0) > 0);
    const bustedBots = occupiedOpponents.filter((seat) => seat.isBot && (seat.stackCents ?? 0) <= 0);
    if (activeOpponents.length === 0 && bustedBots.length > 0) return "Add a bot or invite a player";
    if (occupiedOpponents.length === 0) return "Add a bot to start playing";
    return "Waiting for next hand";
  }
  const heroSeat = snapshot.hero.seat;
  const toActSeat = hand.toActSeat;
  if (toActSeat != null && toActSeat !== heroSeat) {
    const activeSeat = snapshot.seats.find((seat) => seat.seat === toActSeat);
    return `${getShortName(activeSeat?.name)} to act`;
  }
  const heroSeatState = heroSeat != null ? snapshot.seats.find((seat) => seat.seat === heroSeat) : undefined;
  if (heroSeatState?.status === "FOLDED") return "Hand in progress";
  if (toActSeat == null) return "Showdown";
  return "Hand in progress";
}

function derivePhase(snapshot: TableSnapshotPayload): TableRenderPhase {
  if (!snapshot.hand) return "WAITING";
  if (snapshot.hand.toActSeat == null) return "SHOWDOWN";
  return snapshot.hand.street;
}

export function deriveTableViewState(
  snapshot: TableSnapshotPayload,
  connectionStatus?: ConnectionStatus,
): TableViewState {
  const hand = snapshot.hand;
  const seatContext = buildSeatContext(snapshot);
  const heroStatus = getHeroDisplayStatus(snapshot, seatContext);
  const isMyTurn = getIsMyTurn(snapshot, seatContext);
  const communityCards = getCommunityCards(snapshot);
  const potCents = getPotCents(snapshot);
  const heroCards = getHeroCards(snapshot);
  const heroStackCents = getHeroStackCents(snapshot, seatContext);
  const heroSeat = snapshot.hero.seat ?? null;
  const toActSeat = hand?.toActSeat ?? null;
  const isHeroToAct = heroSeat != null && toActSeat != null && heroSeat === toActSeat;
  const heroName = seatContext.heroSeat?.name;
  const heroAvatarUrl = snapshot.hero.avatarUrl ?? seatContext.heroSeat?.avatarUrl ?? undefined;
  const lastHandResult = snapshot.lastHandResult;
  const lastResultMatchesVisualState =
    lastHandResult != null && (hand == null || hand.handId === lastHandResult.handId);
  const heroUserId = snapshot.hero.userId ?? null;
  const heroPayoutCents =
    heroUserId != null && lastHandResult?.payoutsByUserId
      ? Number(lastHandResult.payoutsByUserId[String(heroUserId)] ?? 0)
      : 0;
  const isHeroWinner =
    lastResultMatchesVisualState &&
    ((heroUserId != null && lastHandResult?.winnerId === heroUserId) || heroPayoutCents > 0);
  const isHeroDealer = getIsDealer(snapshot, seatContext);
  const tableName = snapshot.table?.tableName ?? TABLE.defaultTableName;
  const playerCount = seatContext.occupiedCount;
  const maxSeats = snapshot.table?.maxSeats ?? snapshot.seats.length;
  const blinds = snapshot.table
    ? { smallBlindCents: snapshot.table.smallBlindCents, bigBlindCents: snapshot.table.bigBlindCents }
    : undefined;
  const handSummary = hand ? { street: hand.street, potCents: hand.potCents } : undefined;
  const heroRoundBetCents = seatContext.heroSeat?.roundBetCents ?? 0;

  const mergedOptions = mergeCallWithStack(snapshot.hero.actionOptions, snapshot, isMyTurn, heroStackCents, heroRoundBetCents);
  const expandedOptions = expandOptionsWithFullLegal(mergedOptions, snapshot, heroStackCents, heroRoundBetCents);
  const snapshotVersion = snapshot.lessonSnapshotVersion;
  const isCanonicalLessonSnapshot = snapshotVersion != null && snapshotVersion >= CANONICAL_LESSON_SNAPSHOT_VERSION;
  const missingWagerBounds =
    expandedOptions != null &&
    (expandedOptions.canBet || expandedOptions.canRaise) &&
    (expandedOptions.minRaiseTo == null || expandedOptions.maxRaiseTo == null);
  const heroActionOptions = missingWagerBounds
    ? fillWagerBoundsFromSnapshot(expandedOptions, snapshot, heroStackCents, heroRoundBetCents)
    : expandedOptions;
  const heroPromptOptions = snapshot.hero.actionOptions ?? heroActionOptions;

  if (mergedOptions && snapshot.hero?.actionOptions && (snapshot.hero.actionOptions.minRaiseTo == null || snapshot.hero.actionOptions.maxRaiseTo == null)) {
    const needed = (mergedOptions.primaryWagerAction === "BET" && mergedOptions.canBet) || (mergedOptions.primaryWagerAction === "RAISE" && mergedOptions.canRaise);
    if (needed && heroActionOptions?.minRaiseTo != null) {
      console.warn("LESSON_SNAPSHOT_REPAIR: fillWagerBoundsFromSnapshot applied", {
        snapshotId: snapshot.snapshotId,
        lessonSnapshotVersion: snapshotVersion ?? "missing",
        canonicalSnapshot: isCanonicalLessonSnapshot,
      });
    }
  }

  const actionContext = getActionContext({
    isMyTurn,
    actionOptions: heroActionOptions,
    connectionStatus,
  });
  const actionsInteractive =
    actionContext.showActions &&
    !actionContext.showReconnectingOverlay &&
    Object.values(actionContext.allowedActions).some(Boolean);

  return {
    phase: derivePhase(snapshot),
    street: derivePhase(snapshot),
    handId: hand?.handId ?? null,
    completedHandId: lastHandResult?.handId ?? null,
    board: communityCards,
    seats: snapshot.seats,
    potCents,
    heroTurn: isHeroToAct,
    heroPrompt: buildHeroPrompt(isHeroToAct, heroPromptOptions),
    passiveMessage: buildPassiveMessage(snapshot),
    turnCue: isHeroToAct && connectionStatus === "CONNECTED",
    actionsInteractive,
    boardResetEligible: !hand && !!lastHandResult,
    connectionLabel: getTransportMessage(connectionStatus),
    handSummary,
    actionContext,
    canAct: actionContext.showActions,
    heroStatus,
    communityCards,
    heroCards,
    heroStackCents,
    heroActionOptions,
    heroCalculations: snapshot.hero.calculations,
    heroPlayerStats: snapshot.hero.playerStats,
    heroName,
    heroAvatarUrl,
    heroUserId,
    heroSeat,
    isHeroToAct,
    isHeroWinner,
    isHeroDealer,
    tableName,
    playerCount,
    maxSeats,
    blinds,
  };
}
