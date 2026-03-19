import type { Client, Room } from "@colyseus/core";
import type { Dealer } from "../../../engine/Dealer.js";
import type { PokerState } from "../../../state/PokerState.js";
import { logger } from "../../../lib/logger.js";

/**
 * Type definition for join options when a client connects to the table
 * - name: Optional display name for the player
 * - buyInCents: Optional initial buy-in amount in cents
 * - password: Optional password for private tables
 * - tableId: Optional table identifier for routing
 */
export type JoinOptions = { name?: string; buyInCents?: number; password?: string; tableId?: string };

/**
 * Authentication context returned after successful token validation
 * - userId: Unique identifier for the authenticated user
 * - sessionId: The JWT token that was validated
 * - roles: Array of user roles (e.g., 'player', 'admin')
 * - username: Display name for the user
 */
export type AuthContext = { userId: string; sessionId: string; roles: string[]; username: string };

export type InstantGamePresetId = "MULTIPLAYER_RING" | "HEADS_UP_BOT";

export type InstantGameSeedConfig = {
  presetId: InstantGamePresetId;
  targetBotCountOverride?: number;
};

/** Configuration for creating a new poker table */
export type TableConfig = {
  tableId: string;
  name: string;
  maxSeats: number;
  smallBlindCents: number;
  bigBlindCents: number;
  minBuyInCents: number;
  maxBuyInCents: number;
  visibility: "PUBLIC" | "PRIVATE";
  showStats: boolean;
  passwordHash?: string;
  speed: "normal" | "fast";
  createdAt: number;
  updatedAt: number;
  creatorId?: string;
  creatorName: string;
  creatorAvatarUrl: string | null;
  instantGameSeed?: InstantGameSeedConfig;
};

/** Metadata exposed to the lobby system for table discovery */
export type PokerRoomMetadata = {
  tableId: string;
  name: string;
  maxSeats: number;
  smallBlindCents: number;
  bigBlindCents: number;
  minBuyInCents: number;
  maxBuyInCents: number;
  visibility: "PUBLIC" | "PRIVATE";
  showStats: boolean;
  passwordHash?: string;
  speed: "normal" | "fast";
  createdAt: number;
  updatedAt: number;
  runningSince?: number;
  creatorId?: string;
  creatorName: string;
  creatorAvatarUrl: string | null;
  humanCount?: number;
  connectedHumanCount?: number;
  avgPotCents?: number;
  waitlistCount?: number;
};

export type SittingOutSweepOptions = {
  nowTs?: number;
  abandonedPurgeMs?: number;
};

/**
 * Architectural boundary: room services depend on this facade, never on PokerRoom directly.
 * This breaks the circular dependency between PokerRoom and its child controller/services.
 */
export interface PokerRoomFacade {
  roomId: string;
  onMessage: Room["onMessage"];
  clients: Room["clients"];
  allowReconnection: Room["allowReconnection"];
  kickUserByAdmin(userId: string, reason?: string): Promise<void>;
  dealerRef: Dealer;
  state: PokerState;
  leaveCodeSessionReplaced: number;
  reconnectTimeoutMs: number;
  isDeletingInternal: boolean;
  persistentSeatsEnabledInternal: boolean;
  userIdBySessionId: Map<string, string>;
  bindingEpochByUserId: Map<string, number>;
  bindingEpochBySessionId: Map<string, number>;
  
  startStallMonitorInternal(): void;
  updateCreateMetadataInternal(cfg?: TableConfig): void;
  setSessionEventUnbindInternal(unbind: () => void): void;
  touchActivityInternal(): void;
  bootstrapPersistentSeatRecoveryInternal(): Promise<void>;
  disposeInternal(): void;
  addTablePresenceInternal(client: Client, userId: string, displayName?: string): void;
  removeTablePresenceInternal(userId: string): void;
  handleEmptyStateChangeInternal(): void;
  scheduleIdleDisposeInternal(): void;
  runPersistentSeatCleanupInternal(): Promise<void>;
  runSittingOutSweepInternal(options?: SittingOutSweepOptions): Promise<{ purgedUserIds: string[] }>;
  seedInstantBotsInternal(
    presetId: InstantGamePresetId,
    targetBotCountOverride?: number,
  ): Promise<{ ok: boolean; added: number; target: number; reason?: string }>;
  maybeRemoveBotsIfNoHumansInternal(): Promise<void>;
  purgeBotsForDeleteInternal(): void;
  authenticateInternal(client: Client, options: unknown, context: { token?: string; headers?: Headers }): Promise<unknown>;

  // Additional methods used by other controller services
  sendTableMessageInternal(client: { send: (type: string, payload: unknown) => void }, type: string, payload: unknown): void;
  updateMetadataCountsInternal(): void;
  maybeStartPendingInstantGameSeedInternal(): void;
  normalizeActionPayloadInternal(payload: unknown): { payload: unknown; actionId: string; handId?: string } | null;
  getPlayerByUserIdInternal(userId: string): { id: string; kind: string; name: string } | null;
  getPlayerStackCentsInternal(userId: string): number;
  findPlayerSeatInternal(userId: string): number | null;
  withJoinLockInternal(key: string, fn: () => Promise<void>): Promise<void>;
  processJoinBuyInForZeroStackSeatInternal(userId: string, buyInCents: number): Promise<void>;
  logRestoreBindOkInternal(userId: string, sessionId: string): void;
  markDisconnectedSafeInternal(userId: string, disconnectDeadlineTs: number): Promise<void>;
  markReconnectedSafeInternal(userId: string): Promise<void>;
  clearSittingOutOnRestoreSafeInternal(userId: string): Promise<void>;
  markAbandonedSafeInternal(userId: string): Promise<void>;
  emitSnapshotsToAllSafeInternal(reason: string): Promise<void>;
  isChatRateLimitedInternal(sessionId: string): boolean;
  isActionRateLimitedInternal(sessionId: string): boolean;
  setLastAcceptedActionInternal(
    userId: string,
    action: { action: string; amountCents?: number; actionId: string; atTs: number },
  ): void;
  getLastAcceptedActionInternal(userId: string): { action: string; amountCents?: number; actionId: string; atTs: number } | undefined;
}

export type PokerRoomContext = {
  room: PokerRoomFacade;
  roomId: string;
  dealer: Dealer;
  state: PokerState;
  logger: typeof logger;
  startStallMonitor(): void;
  updateCreateMetadata(cfg?: unknown): void;
  registerVoiceRelay(): void;
  setSessionEventUnbind: (unbind: () => void) => void;
  touchActivity(): void;
  bootstrapPersistentSeatRecovery(): Promise<void>;
  disposeRoom(): void;
  addTablePresence(client: Client, userId: string, displayName?: string): void;
  removeTablePresence(userId: string): void;
  handleEmptyStateChange(): void;
  scheduleIdleDispose(): void;
  runPersistentSeatCleanup(): Promise<void>;
  runSittingOutSweep(options?: SittingOutSweepOptions): Promise<{ purgedUserIds: string[] }>;
  seedInstantBots(
    presetId: InstantGamePresetId,
    targetBotCountOverride?: number,
  ): Promise<{ ok: boolean; added: number; target: number; reason?: string }>;
  maybeStartPendingInstantGameSeed(): void;
  maybeRemoveBotsIfNoHumans(): Promise<void>;
  purgeBotsForDelete(): void;
};

export interface PokerRoomAuthService {
  authenticate(client: Client, options: unknown, context: { token?: string; headers?: Headers }): Promise<unknown>;
}

export interface PokerRoomJoinServiceContract {
  handleJoin(client: Client, options: JoinOptions, auth?: AuthContext): Promise<void>;
}

export interface PokerRoomLeaveServiceContract {
  handleLeave(client: Client, code?: number): Promise<void>;
}

export interface PokerRoomMessageRouterContract {
  registerAll(): void;
}

export interface PokerRoomLifecycleContract {
  setup(options?: { cfg?: unknown }): void;
  dispose(): void;
}
