import { Client } from "@colyseus/core";
import { createHash } from "node:crypto";
import { nanoid } from "nanoid";
import { TableOutboundMessageSchema, type HeroActionOptions, type TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { logger } from "../../../lib/logger.js";
import type { PokerState } from "../../../state/PokerState.js";
import { HandCalculationsCoordinator } from "../../odds/HandCalculationsCoordinator.js";

export type SnapshotReason = TableSnapshotPayload["reason"];

type SnapshotEmitHook = (args: {
  tableId: string;
  handId?: string;
  snapshotId: string;
  reason: SnapshotReason;
  street: string;
  payloadJson: TableSnapshotPayload;
  stateHash: string;
  schemaVersion: number;
}) => Promise<void> | void;

export class SnapshotService {
  private readonly handCalculations = new HandCalculationsCoordinator();
  private snapshotSeq = 0;

  constructor(private readonly deps: {
    state: PokerState;
    clientsByUserId: Map<string, Client>;
    holeCardsByPlayerId: Map<string, string[]>;
    getHeroActionOptions: (userId: string) => HeroActionOptions | undefined;
    getLastHandResult: () => TableSnapshotPayload["lastHandResult"] | undefined;
    getLastAction: () => TableSnapshotPayload["lastAction"] | undefined;
    onTableSnapshotEmitted?: SnapshotEmitHook;
  }) {}

  emitToAll(reason: SnapshotReason, actionId?: string): void {
    this.updateCurrentHandCalculations();
    const snapshotSeq = this.nextSnapshotSeq();
    for (const [userId, client] of this.deps.clientsByUserId.entries()) {
      const raw = this.buildTableSnapshot(userId, reason, actionId, snapshotSeq);
      const payload = this.plainPayload(raw);
      const parsed = TableOutboundMessageSchema.safeParse({ type: "TABLE_SNAPSHOT", payload });
      if (!parsed.success) {
        logger.warn(
          { reason, userId, errors: parsed.error.flatten(), issues: parsed.error.issues },
          "Dropping invalid TABLE_SNAPSHOT payload",
        );
        continue;
      }
      if (parsed.data.type !== "TABLE_SNAPSHOT") continue;

      client.send("TABLE_SNAPSHOT", parsed.data.payload);
      this.emitSnapshotHook(parsed.data.payload, reason);
      logger.debug({
        snapshotVersion: parsed.data.payload.version,
        handId: parsed.data.payload.hand?.handId ?? "",
        actionId: parsed.data.payload.actionId ?? "",
        reason,
        userId,
      }, "TABLE_SNAPSHOT emitted");
    }
  }

  /** Copy to plain JSON object so Colyseus Schema references don't break Zod validation or serialization. */
  private plainPayload(payload: TableSnapshotPayload): TableSnapshotPayload {
    return JSON.parse(JSON.stringify(payload)) as TableSnapshotPayload;
  }

  emitToUser(userId: string, reason: SnapshotReason, actionId?: string): void {
    const client = this.deps.clientsByUserId.get(userId);
    if (!client) return;

    this.updateCurrentHandCalculations();
    const raw = this.buildTableSnapshot(userId, reason, actionId, this.nextSnapshotSeq());
    const payload = this.plainPayload(raw);
    const parsed = TableOutboundMessageSchema.safeParse({ type: "TABLE_SNAPSHOT", payload });
    if (!parsed.success) {
      logger.warn(
        { reason, userId, errors: parsed.error.flatten(), issues: parsed.error.issues },
        "Dropping invalid TABLE_SNAPSHOT payload",
      );
      return;
    }
    if (parsed.data.type !== "TABLE_SNAPSHOT") return;

    client.send("TABLE_SNAPSHOT", parsed.data.payload);
    this.emitSnapshotHook(parsed.data.payload, reason);
    logger.debug({
      snapshotVersion: parsed.data.payload.version,
      handId: parsed.data.payload.hand?.handId ?? "",
      actionId: parsed.data.payload.actionId ?? "",
      reason,
      userId,
    }, "TABLE_SNAPSHOT emitted (single user)");
  }

  private emitSnapshotHook(payload: TableSnapshotPayload, reason: SnapshotReason): void {
    const callback = this.deps.onTableSnapshotEmitted;
    if (!callback) return;

    const state = this.deps.state;
    void Promise.resolve(callback({
      tableId: state.tableId,
      handId: state.handId || undefined,
      snapshotId: payload.snapshotId,
      reason,
      street: payload.hand?.street ?? "WAITING",
      payloadJson: payload,
      stateHash: payload.stateHash,
      schemaVersion: payload.version,
    })).catch((err) => {
      logger.warn({ err, tableId: state.tableId, snapshotId: payload.snapshotId }, "TABLE_SNAPSHOT_LOG_WRITE_FAILED");
    });
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
      holeCardsByPlayerId: this.deps.holeCardsByPlayerId,
      getActionOptions: (userId) => this.deps.getHeroActionOptions(userId),
    });
  }

  private nextSnapshotSeq(): number {
    this.snapshotSeq += 1;
    return this.snapshotSeq;
  }

  private buildTableSnapshot(
    userId: string,
    reason: SnapshotReason,
    actionId: string | undefined,
    snapshotSeq: number,
  ): TableSnapshotPayload {
    const state = this.deps.state;
    const nowTs = Date.now();
    const hero = state.playersById.get(userId);
    const seats = state.seats.map((occupantUserId, seat) => {
      const player = occupantUserId ? state.playersById.get(occupantUserId) : undefined;
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
        connected: player?.connected ?? false,
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

    const payloadWithoutHash = {
      version: 1 as const,
      snapshotId: `snap_${state.tableId}_${nanoid(10)}`,
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
      hero: {
        userId,
        youAreSeated: Boolean(hero),
        seat: hero?.seat,
        holeCards: hero ? this.deps.holeCardsByPlayerId.get(userId) : undefined,
        actionOptions: this.deps.getHeroActionOptions(userId),
        calculations: (() => {
          const calc = this.handCalculations.getForUser(userId);
          const options = this.deps.getHeroActionOptions(userId);
          const callAmount = options?.callAmount ?? 0;
          const potOddsPct = callAmount > 0
            ? Math.round((callAmount / (state.potCents + callAmount)) * 100)
            : undefined;

          if (!calc && potOddsPct === undefined) return undefined;
          return {
            mode: calc?.mode ?? "SHOWDOWN_ANALYSIS",
            stale: calc?.stale ?? false,
            ...calc,
            potOddsPct,
          };
        })(),
      },
      calculationsMeta: this.handCalculations.getMeta(),
      lastAction: this.deps.getLastAction(),
      lastHandResult: this.deps.getLastHandResult(),
    };

    const stateHash = createHash("sha1").update(JSON.stringify(payloadWithoutHash)).digest("hex");
    return {
      ...payloadWithoutHash,
      stateHash,
    };
  }
}
