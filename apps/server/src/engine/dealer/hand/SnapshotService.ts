/**
 * SnapshotService - Game State Snapshots & Client Notifications
 * 
 * PURPOSE:
 * Manages game state snapshots and real-time client notifications.
 * Handles snapshot creation, validation, broadcasting, and persistence.
 * Integrates with hand calculations and replay system.
 * 
 * KEY RESPONSIBILITIES:
 * - Create and validate game state snapshots
 * - Broadcast snapshots to connected clients
 * - Calculate hand odds and statistics
 * - Manage snapshot sequencing and versioning
 * - Provide hooks for custom snapshot processing
 * 
 * CLIENT COMMUNICATION:
 * - Uses Colyseus for real-time message broadcasting
 * - Maintains client connection state
 * - Handles message validation and routing
 * 
 * USAGE:
 * const service = new SnapshotService(dependencies);
 * await service.emitToAll("HAND_START");
 * // Snapshots are broadcast to all connected clients
 * 
 */

// ============================================================================
// IMPORTS - External Dependencies
// ============================================================================
import { Client } from "@colyseus/core";
import { createHash } from "node:crypto";

// ============================================================================
// IMPORTS - Internal Dependencies
// ============================================================================
import { logger } from "../../../lib/logger.js";
import type { PokerState } from "../../../state/PokerState.js";
import { HandCalculationsCoordinator } from "../../odds/HandCalculationsCoordinator.js";
import { toFrameReason, type FrameReason } from "../../replay/FrameReason.js";

// ============================================================================
// IMPORTS - Metrics & Monitoring
// ============================================================================
import { snapshotMetrics } from "../metrics/snapshotMetrics.js";

// ============================================================================
// IMPORTS - Type Definitions
// ============================================================================
import { TableOutboundMessageSchema, type HeroActionOptions, type TableSnapshotPayload } from "@poker-champ/realtime-contract";

// ============================================================================
// TYPE DEFINITIONS & CONSTANTS
// ============================================================================

/**
 * Snapshot emission hook for custom processing
 * Allows external systems to intercept and process snapshots
 * before they are broadcast to clients.
 */
export type SnapshotEmitHook = (args: {
  tableId: string;
  handId?: string;
  snapshotId: string;
  reason: SnapshotReason;
  frameReason?: FrameReason;
  street: string;
  payloadJson: TableSnapshotPayload;
  stateHash: string;
  schemaVersion: number;
}) => Promise<void> | void;

/**
 * Snapshot reason type alias for cleaner imports
 */
export type SnapshotReason = TableSnapshotPayload["reason"];

/** Schema version for ERROR payloads; must match realtime-contract. */
const ERROR_PAYLOAD_VERSION = 1;

/** User-facing message when snapshot validation fails; client can show Retry/Leave. */
const SNAPSHOT_INVALID_MESSAGE =
  "Table failed to load due to a server error. Please try again or leave the table.";

/** Max wait for avatar fetch so snapshot emission never blocks the action queue. */
const AVATAR_FETCH_TIMEOUT_MS = 2000;

/** One-line searchable first failing path from Zod error (e.g. "payload.snapshotSeq"). */
function getFirstFailingPath(err: { issues?: Array<{ path?: PropertyKey[] }> }): string | null {
  const first = err.issues?.[0];
  if (!first?.path?.length) return null;
  return first.path.map((segment) => String(segment)).join(".");
}

// ============================================================================
// MAIN CLASS - Snapshot Management & Broadcasting
// ============================================================================

/**
 * SnapshotService - Core service for managing game state snapshots
 * 
 * This class handles the creation, validation, and broadcasting of game
 * state snapshots to connected clients. It integrates with the hand
 * calculation system and provides hooks for custom snapshot processing.
 * 
 * CLIENT INTEGRATION:
 * - Uses Colyseus for real-time message broadcasting
 * - Maintains client connection state and message routing
 * - Validates outbound messages against schemas
 * 
 * SNAPSHOTS:
 * - Creates comprehensive game state snapshots
 * - Includes hand calculations, odds, and statistics
 * - Sequences and versions snapshots for replay
 * 
 * USAGE:
 * const service = new SnapshotService(dependencies);
 * await service.emitToAll("HAND_START");
 * // Snapshots are broadcast to all connected clients
 */
export class SnapshotService {
  // ============================================================================
  // CLASS PROPERTIES - State Management & Tracking
  // ============================================================================
  
  /** Hand calculations coordinator for odds and statistics */
  private readonly handCalculations = new HandCalculationsCoordinator();
  /** Global snapshot sequence counter (shared by broadcast and user-targeted snapshots; contract requires positive) */
  private snapshotSeq = 0;
  /** Last hand key for detecting hand changes */
  private lastHandKey: string | null = null;

  /**
   * Fetch avatar with timeout so slow or stuck avatar lookup never blocks the game loop.
   * Returns nulls on timeout or throw.
   */
  private async getAvatarWithTimeout(userId: string): Promise<{ avatarUrl: string | null; avatarVersion: number | null }> {
    const getAvatar = this.deps.getAvatarByUserId;
    if (!getAvatar) return { avatarUrl: null, avatarVersion: null };
    const fallback = (): { avatarUrl: string | null; avatarVersion: number | null } =>
      ({ avatarUrl: null, avatarVersion: null });
    try {
      const result = await Promise.race([
        getAvatar(userId),
        new Promise<{ avatarUrl: string | null; avatarVersion: number | null }>((resolve) =>
          setTimeout(() => resolve(fallback()), AVATAR_FETCH_TIMEOUT_MS),
        ),
      ]);
      return result ?? fallback();
    } catch {
      return fallback();
    }
  }

  // ============================================================================
  // CONSTRUCTOR & DEPENDENCIES
  // ============================================================================
  
  /**
   * Initialize SnapshotService with required dependencies
   * @param deps - Service dependencies for state, clients, and data access
   */
  constructor(private readonly deps: {
    state: PokerState;
    clientsByUserId: Map<string, Client>;
    getHoleCardsByPlayerId: () => Map<string, string[]>;
    getHeroActionOptions: (userId: string) => HeroActionOptions | undefined;
    getLastHandResult: () => TableSnapshotPayload["lastHandResult"] | undefined;
    getLastAction: () => TableSnapshotPayload["lastAction"] | undefined;
    getHeroSessionStats?: (userId: string) => TableSnapshotPayload["hero"]["playerStats"];
    /** Optional hook for custom snapshot processing */
    emitHook?: SnapshotEmitHook;
    /** Optional: fetch avatar for snapshot seat/hero. When provided, seats and hero include avatarUrl/avatarVersion. */
    getAvatarByUserId?: (userId: string) => Promise<{ avatarUrl: string | null; avatarVersion: number | null }>;
  }) {}

  // ============================================================================
  // SNAPSHOT BROADCASTING METHODS
  // ============================================================================

  /**
   * Emit snapshot to all connected clients
   * 
   * PROCESS:
   * 1. Generate unique snapshot sequence number
   * 2. Refresh hand calculations if needed
   * 3. Build comprehensive snapshot payload
   * 4. Determine current acting player for context
   * 5. Validate snapshot integrity (development mode)
   * 6. Apply custom emit hook if provided
   * 7. Broadcast to all clients via Colyseus
   * 8. Record metrics for monitoring
   * 
   * BROADCASTING:
   * - Uses Colyseus room broadcast for efficiency
   * - Validates message schema before sending
   * - Handles connection state management
   * 
   * @param reason Snapshot reason for context
   * @param actionId Optional action identifier
   * @returns void - Async broadcast operation
   */
  /** When set, this recipient is sent the snapshot first even if not in clientsByUserId (avoids missing update if client was unbound during async build). */
  async emitToAll(
    reason: SnapshotReason,
    actionId?: string,
    ensureRecipient?: { userId: string; client: Client },
  ): Promise<void> {
    const t0 = performance.now();
    const snapshotSeq = this.nextSnapshotSeq();
    this.refreshHandCalculationsIfNeeded();
    const base = await this.buildBaseSnapshot(reason, actionId, snapshotSeq);
    const toActUserId = this.deps.state.street !== "WAITING"
      ? (this.deps.state.seats[this.deps.state.toActSeat] ?? null)
      : null;

    const systemPayload = this.finalizePayload(await this.buildHeroPatch("SYSTEM", base, toActUserId));
    this.emitSnapshotHook(systemPayload, reason);

    const tableId = this.deps.state.tableId;
    const sendToOne = async (userId: string, client: Client): Promise<boolean> => {
      const payload = await this.buildHeroPatch(userId, base, toActUserId);
      const final = this.finalizePayload(payload);
      const parsed = TableOutboundMessageSchema.safeParse({ type: "TABLE_SNAPSHOT", payload: final });
      if (!parsed.success) {
        const path = getFirstFailingPath(parsed.error);
        logger.warn(
          { reason, userId, tableId, snapshotSeq, path, errors: parsed.error.flatten() },
          "SNAPSHOT_DROP tableId=%s userId=%s reason=%s path=%s",
          tableId,
          userId,
          reason,
          path ?? "unknown",
        );
        client.send("ERROR", {
          version: ERROR_PAYLOAD_VERSION,
          code: "SNAPSHOT_INVALID",
          message: SNAPSHOT_INVALID_MESSAGE,
        });
        return false;
      }
      try {
        client.send("TABLE_SNAPSHOT", final);
        snapshotMetrics.emitSnapshot();
        return true;
      } catch (err) {
        logger.warn({ err, userId, tableId, reason }, "SNAPSHOT_SEND_FAILED ensureRecipient");
        return false;
      }
    };

    if (ensureRecipient) {
      await sendToOne(ensureRecipient.userId, ensureRecipient.client);
    }
    for (const [userId, client] of this.deps.clientsByUserId.entries()) {
      if (ensureRecipient && userId === ensureRecipient.userId) continue;
      await sendToOne(userId, client);
    }
    snapshotMetrics.observeBuildMs(performance.now() - t0);
  }

  async emitToUser(userId: string, reason: SnapshotReason, actionId?: string): Promise<void> {
    const client = this.deps.clientsByUserId.get(userId);
    if (!client) return;

    const t0 = performance.now();
    const snapshotSeq = this.nextSnapshotSeq();
    this.refreshHandCalculationsIfNeeded();
    const base = await this.buildBaseSnapshot(reason, actionId, snapshotSeq);
    const toActUserId = this.deps.state.street !== "WAITING"
      ? (this.deps.state.seats[this.deps.state.toActSeat] ?? null)
      : null;
    const payload = await this.buildHeroPatch(userId, base, toActUserId);
    const final = this.finalizePayload(payload);

    const parsed = TableOutboundMessageSchema.safeParse({ type: "TABLE_SNAPSHOT", payload: final });
    if (!parsed.success) {
      const tableId = this.deps.state.tableId;
      const path = getFirstFailingPath(parsed.error);
      logger.warn(
        { reason, userId, tableId, snapshotSeq, path, errors: parsed.error.flatten() },
        "SNAPSHOT_DROP tableId=%s userId=%s reason=%s path=%s",
        tableId,
        userId,
        reason,
        path ?? "unknown",
      );
      client.send("ERROR", {
        version: ERROR_PAYLOAD_VERSION,
        code: "SNAPSHOT_INVALID",
        message: SNAPSHOT_INVALID_MESSAGE,
      });
      return;
    }
    client.send("TABLE_SNAPSHOT", final);
    snapshotMetrics.emitSnapshot();

    const systemPayload = this.finalizePayload(await this.buildHeroPatch("SYSTEM", base, toActUserId));
    this.emitSnapshotHook(systemPayload, reason);
    snapshotMetrics.observeBuildMs(performance.now() - t0);
  }

  private emitSnapshotHook(payload: TableSnapshotPayload, reason: SnapshotReason): void {
    const callback = this.deps.emitHook;
    if (!callback) return;

    const state = this.deps.state;
    void Promise.resolve(callback({
      tableId: state.tableId,
      handId: state.handId || undefined,
      snapshotId: payload.snapshotId,
      reason,
      frameReason: toFrameReason(reason) ?? undefined,
      street: payload.hand?.street ?? "WAITING",
      payloadJson: payload,
      stateHash: payload.stateHash,
      schemaVersion: payload.version,
    })).catch((err) => {
      logger.warn({ err, tableId: state.tableId, snapshotId: payload.snapshotId }, "TABLE_SNAPSHOT_LOG_WRITE_FAILED");
    });
  }

  private refreshHandCalculationsIfNeeded(): string | null {
    const handKey = this.buildHandCalculationKey();
    if (handKey === this.lastHandKey) return handKey;
    this.lastHandKey = handKey;
    this.updateCurrentHandCalculations();
    return handKey;
  }

  private buildHandCalculationKey(): string | null {
    const state = this.deps.state;
    if (!state.handId || state.street === "WAITING") return null;

    const boardKey = state.board.join(",");
    const playersKey = [...state.playersById.values()]
      .sort((a, b) => a.seat - b.seat)
      .map((p) => `${p.id}:${p.status}:${p.stackCents}:${p.roundBetCents}:${p.committedCents}`)
      .join("|");
    const holeCardsKey = [...this.deps.getHoleCardsByPlayerId().entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, cards]) => `${id}:${cards.join(",")}`)
      .join("|");

    return [
      state.handId,
      state.street,
      state.toActSeat,
      state.actionCount,
      state.potCents,
      state.roundCurrentBetCents,
      state.minRaiseCents,
      boardKey,
      playersKey,
      holeCardsKey,
    ].join("_");
  }

  private updateCurrentHandCalculations(): void {
    const state = this.deps.state;
    this.handCalculations.refresh({
      tableId: state.tableId,
      handId: state.handId,
      street: state.street,
      board: [...state.board],
      potCents: state.potCents,
      roundCurrentBetCents: state.roundCurrentBetCents,
      minRaiseCents: state.minRaiseCents,
      toActSeat: state.toActSeat,
      players: [...state.playersById.values()].map((player) => ({
        id: player.id,
        seat: player.seat,
        status: player.status,
        stackCents: player.stackCents,
        roundBetCents: player.roundBetCents,
        committedCents: player.committedCents,
      })),
      holeCardsByPlayerId: this.deps.getHoleCardsByPlayerId(),
      getActionOptions: (userId) => this.deps.getHeroActionOptions(userId),
    });
  }

  // ============================================================================
  // HELPER & UTILITY METHODS
  // ============================================================================

  /**
   * Generate next snapshot sequence number
   * 
   * PURPOSE:
   * Provides sequential numbering for snapshots
   * Handles bootstrap scenario for proper initialization
   * 
   * @returns Next snapshot sequence number
   */
  private nextSnapshotSeq(): number {
    this.snapshotSeq += 1;
    return this.snapshotSeq;
  }

  /**
   * Get current snapshot sequence number
   * 
   * PURPOSE:
   * Returns the current snapshot sequence for validation
   * Ensures sequence starts at 1 after bootstrap
   * 
   * @returns Current snapshot sequence number
   */
  private currentSnapshotSeq(): number {
    if (this.snapshotSeq <= 0) {
      logger.warn({ tableId: this.deps.state.tableId, reason: "bootstrap" }, "TABLE_SNAPSHOT_SEQ_BOOTSTRAP_TO_ONE");
      return 1;
    }
    return this.snapshotSeq;
  }

  /**
   * Build base snapshot payload with common fields
   * 
   * PROCESS:
   * 1. Capture current game state and metadata
   * 2. Include table configuration and player states
   * 3. Add timing and sequence information
   * 4. Generate state hash for integrity validation
   * 
   * @param reason Snapshot reason for context
   * @param actionId Optional action identifier
   * @param snapshotSeq Unique sequence number
   * @returns Base snapshot payload object
   */
  private async buildBaseSnapshot(
    reason: SnapshotReason,
    actionId: string | undefined,
    snapshotSeq: number,
  ): Promise<Omit<TableSnapshotPayload, "hero" | "stateHash">> {
    const state = this.deps.state;
    const nowTs = Date.now();

    const seats = await Promise.all(
      state.seats.map(async (occupantUserId, seat) => {
        const player = occupantUserId ? state.playersById.get(occupantUserId) : undefined;
        const connected = player?.connected ?? false;
        const disconnectDeadlineTs = player?.disconnectDeadlineTs ?? 0;
        if (connected && disconnectDeadlineTs !== 0) {
          logger.error({ tableId: state.tableId, seat, playerId: player?.id }, "INVARIANT: connected player must have disconnectDeadlineTs 0");
          throw new Error("INVARIANT_VIOLATION");
        }
        let avatarUrl: string | undefined;
        let avatarVersion: number | undefined;
        if (occupantUserId && player?.kind === "HUMAN") {
          const av = await this.getAvatarWithTimeout(occupantUserId);
          if (av.avatarUrl) avatarUrl = av.avatarUrl;
          if (av.avatarVersion != null) avatarVersion = av.avatarVersion;
        }
        return {
          seat,
          occupied: Boolean(player),
          userId: player?.id,
          isBot: player?.kind === "BOT",
          name: player?.name || "Empty",
          status: player?.status ?? "OUT",
          stackCents: player?.stackCents ?? 0,
          roundBetCents: player?.roundBetCents ?? 0,
          committedCents: player?.committedCents ?? 0,
          connected,
          disconnectDeadlineTs,
          isDealer: state.dealerSeat === seat,
          isToAct: state.toActSeat === seat,
          ...(avatarUrl != null && { avatarUrl }),
          ...(avatarVersion != null && { avatarVersion }),
        };
      }),
    );

    const hand = state.street === "WAITING"
      ? undefined
      : {
          handId: state.handId,
          handNumber: state.handNumber,
          street: state.street,
          dealerSeat: state.dealerSeat,
          sbSeat: state.sbSeat,
          bbSeat: state.bbSeat,
          toActSeat: state.toActSeat,
          actionCount: state.actionCount,
          roundCurrentBetCents: state.roundCurrentBetCents,
          minRaiseCents: state.minRaiseCents,
          potCents: state.potCents,
          board: [...state.board],
        };

    return {
      version: 1 as const,
      snapshotId: `snap_${state.tableId}_${snapshotSeq}`,
      snapshotSeq,
      emittedAtTs: nowTs,
      serverTimeTs: nowTs,
      reason,
      actionId,
      nextHandAtTs: state.nextHandAtTs || undefined,
      table: {
        tableId: state.tableId,
        tableName: state.tableName,
        ...(state.creatorId ? { creatorId: state.creatorId } : {}),
        visibility: state.visibility,
        maxSeats: state.maxSeats,
        smallBlindCents: state.smallBlindCents,
        bigBlindCents: state.bigBlindCents,
        minBuyInCents: state.minBuyInCents,
        maxBuyInCents: state.maxBuyInCents,
        showStats: state.showStats,
      },
      hand,
      seats,
      calculationsMeta: this.handCalculations.getMeta(),
      lastAction: this.deps.getLastAction(),
      lastHandResult: this.deps.getLastHandResult(),
    };
  }

  private async buildHeroPatch(
    userId: string,
    base: Omit<TableSnapshotPayload, "hero" | "stateHash">,
    toActUserId: string | null,
  ): Promise<Omit<TableSnapshotPayload, "stateHash">> {
    const state = this.deps.state;
    const hero = state.playersById.get(userId);
    const liveHoleCards = hero ? this.deps.getHoleCardsByPlayerId().get(userId) : undefined;
    const revealedShowdownHoleCards =
      hero && state.street === "WAITING"
        ? this.deps.getLastHandResult()?.showdownHoleCardsByUserId?.[userId]
        : undefined;
    const heroHoleCards = liveHoleCards ?? (revealedShowdownHoleCards ? [...revealedShowdownHoleCards] : undefined);
    const actionOptions = userId === toActUserId ? this.deps.getHeroActionOptions(userId) : undefined;
    const calc = this.handCalculations.getForUser(userId);
    const callAmount = actionOptions?.callAmount ?? 0;
    const potOddsPct = callAmount > 0
      ? Math.round((callAmount / (state.potCents + callAmount)) * 100)
      : undefined;

    let avatarUrl: string | undefined;
    let avatarVersion: number | undefined;
    const av = await this.getAvatarWithTimeout(userId);
    if (av.avatarUrl) avatarUrl = av.avatarUrl;
    if (av.avatarVersion != null) avatarVersion = av.avatarVersion;

    const hasCalc = Boolean(calc) || potOddsPct !== undefined;
    const heroSection = {
      userId,
      youAreSeated: Boolean(hero),
      seat: hero?.seat,
      holeCards: hero ? heroHoleCards : undefined,
      actionOptions,
      calculations: hasCalc
        ? {
            mode: (calc?.mode ?? "SHOWDOWN_ANALYSIS") as "LIVE_ADVISORY" | "SHOWDOWN_ANALYSIS",
            stale: calc?.stale ?? false,
            equityPct: calc?.equityPct,
            potOddsPct: calc?.potOddsPct ?? potOddsPct,
            outs: calc?.outs,
            updatedAtTs: calc?.updatedAtTs,
          }
        : undefined,
      playerStats: this.deps.getHeroSessionStats?.(userId),
      ...(avatarUrl != null && { avatarUrl }),
      ...(avatarVersion != null && { avatarVersion }),
    };

    return { ...base, hero: heroSection };
  }

  private finalizePayload(payload: Omit<TableSnapshotPayload, "stateHash">): TableSnapshotPayload {
    const stateHash = createHash("sha1").update(JSON.stringify(payload)).digest("hex");
    return { ...payload, stateHash };
  }
}
