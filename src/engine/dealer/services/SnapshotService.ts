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

/**
 * Environment flag for snapshot validation
 * Enables additional validation in non-production environments
 */
const VALIDATE_SNAPSHOTS = process.env.NODE_ENV !== "production";

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
  /** Snapshot sequence counter for unique identification */
  private snapshotSeq = 0;
  /** Last hand key for detecting hand changes */
  private lastHandKey: string | null = null;

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
  emitToAll(reason: SnapshotReason, actionId?: string): void {
    const t0 = performance.now();
    const snapshotSeq = this.nextSnapshotSeq();
    this.refreshHandCalculationsIfNeeded();
    const base = this.buildBaseSnapshot(reason, actionId, snapshotSeq);
    const toActUserId = this.deps.state.street !== "WAITING"
      ? (this.deps.state.seats[this.deps.state.toActSeat] ?? null)
      : null;

    const systemPayload = this.finalizePayload(this.buildHeroPatch("SYSTEM", base, toActUserId), "SYSTEM");
    this.emitSnapshotHook(systemPayload, reason);

    for (const [userId, client] of this.deps.clientsByUserId.entries()) {
      const payload = this.buildHeroPatch(userId, base, toActUserId);
      const final = this.finalizePayload(payload, userId);
      if (VALIDATE_SNAPSHOTS) {
        const parsed = TableOutboundMessageSchema.safeParse({ type: "TABLE_SNAPSHOT", payload: final });
        if (!parsed.success) {
          logger.warn({ reason, userId, errors: parsed.error.flatten() }, "Dropping invalid TABLE_SNAPSHOT payload");
          continue;
        }
      }
      client.send("TABLE_SNAPSHOT", final);
      snapshotMetrics.emitSnapshot();
    }
    snapshotMetrics.observeBuildMs(performance.now() - t0);
  }

  emitToUser(userId: string, reason: SnapshotReason, actionId?: string): void {
    const client = this.deps.clientsByUserId.get(userId);
    if (!client) return;

    const t0 = performance.now();
    const snapshotSeq = this.currentSnapshotSeq();
    this.refreshHandCalculationsIfNeeded();
    const base = this.buildBaseSnapshot(reason, actionId, snapshotSeq);
    const toActUserId = this.deps.state.street !== "WAITING"
      ? (this.deps.state.seats[this.deps.state.toActSeat] ?? null)
      : null;
    const payload = this.buildHeroPatch(userId, base, toActUserId);
    const final = this.finalizePayload(payload, userId);

    if (VALIDATE_SNAPSHOTS) {
      const parsed = TableOutboundMessageSchema.safeParse({ type: "TABLE_SNAPSHOT", payload: final });
      if (!parsed.success) {
        logger.warn({ reason, userId, errors: parsed.error.flatten() }, "Dropping invalid TABLE_SNAPSHOT payload");
        return;
      }
    }
    client.send("TABLE_SNAPSHOT", final);
    snapshotMetrics.emitSnapshot();

    const systemPayload = this.finalizePayload(this.buildHeroPatch("SYSTEM", base, toActUserId), "SYSTEM");
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
    const state = this.deps.state;
    const handKey = state.handId && state.street !== "WAITING"
      ? `${state.handId}_${state.street}_${state.toActSeat}_${state.actionCount}`
      : null;
    if (handKey === this.lastHandKey) return handKey;
    this.lastHandKey = handKey;
    this.updateCurrentHandCalculations();
    return handKey;
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
  private buildBaseSnapshot(
    reason: SnapshotReason,
    actionId: string | undefined,
    snapshotSeq: number,
  ): Omit<TableSnapshotPayload, "hero" | "stateHash"> {
    const state = this.deps.state;
    const nowTs = Date.now();

    const seats = state.seats.map((occupantUserId, seat) => {
      const player = occupantUserId ? state.playersById.get(occupantUserId) : undefined;
      const connected = player?.connected ?? false;
      const disconnectDeadlineTs = player?.disconnectDeadlineTs ?? 0;
      if (connected && disconnectDeadlineTs !== 0) {
        logger.error({ tableId: state.tableId, seat, playerId: player?.id }, "INVARIANT: connected player must have disconnectDeadlineTs 0");
        throw new Error("INVARIANT_VIOLATION");
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
      };
    });

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
        visibility: state.visibility,
        maxSeats: state.maxSeats,
        smallBlindCents: state.smallBlindCents,
        bigBlindCents: state.bigBlindCents,
        minBuyInCents: state.minBuyInCents,
        maxBuyInCents: state.maxBuyInCents,
      },
      hand,
      seats,
      calculationsMeta: this.handCalculations.getMeta(),
      lastAction: this.deps.getLastAction(),
      lastHandResult: this.deps.getLastHandResult(),
    };
  }

  private buildHeroPatch(
    userId: string,
    base: Omit<TableSnapshotPayload, "hero" | "stateHash">,
    toActUserId: string | null,
  ): Omit<TableSnapshotPayload, "stateHash"> {
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
    };

    return { ...base, hero: heroSection };
  }

  private finalizePayload(payload: Omit<TableSnapshotPayload, "stateHash">, _userId: string): TableSnapshotPayload {
    const stateHash = createHash("sha1").update(JSON.stringify(payload)).digest("hex");
    return { ...payload, stateHash };
  }
}
