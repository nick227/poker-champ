import type { Client } from "@colyseus/core";
import type { PokerRoomContext } from "./types/PokerRoomTypes.js";

/**
 * Handles client/user session binding and stale-session protection.
 */
export class PokerRoomSessionManager {
  private readonly userIdBySessionId: Map<string, string>;
  private readonly bindingEpochByUserId: Map<string, number>;
  private readonly bindingEpochBySessionId: Map<string, number>;

  constructor(
    private readonly ctx: PokerRoomContext,
    private readonly options: {
      leaveCodeSessionReplaced: number;
      userIdBySessionId?: Map<string, string>;
      bindingEpochByUserId?: Map<string, number>;
      bindingEpochBySessionId?: Map<string, number>;
    },
  ) {
    this.userIdBySessionId = options.userIdBySessionId ?? new Map();
    this.bindingEpochByUserId = options.bindingEpochByUserId ?? new Map();
    this.bindingEpochBySessionId = options.bindingEpochBySessionId ?? new Map();
  }

  getUserIdForSession(sessionId: string): string | undefined {
    return this.userIdBySessionId.get(sessionId);
  }

  setUserForSession(sessionId: string, userId: string): void {
    this.userIdBySessionId.set(sessionId, userId);
  }

  takeUserForSession(sessionId: string): string | undefined {
    const userId = this.userIdBySessionId.get(sessionId);
    this.userIdBySessionId.delete(sessionId);
    this.bindingEpochBySessionId.delete(sessionId);
    return userId;
  }

  deleteSession(sessionId: string): void {
    this.userIdBySessionId.delete(sessionId);
    this.bindingEpochBySessionId.delete(sessionId);
  }

  deleteUserEpoch(userId: string): void {
    this.bindingEpochByUserId.delete(userId);
  }

  deleteUserBinding(userId: string): void {
    this.bindingEpochByUserId.delete(userId);
  }

  invalidatePriorBinding(userId: string): void {
    const nextEpoch = (this.bindingEpochByUserId.get(userId) ?? 0) + 1;
    this.bindingEpochByUserId.set(userId, nextEpoch);
  }

  valuesUserIds(): IterableIterator<string> {
    return this.userIdBySessionId.values();
  }

  clearAll(): void {
    this.userIdBySessionId.clear();
    this.bindingEpochBySessionId.clear();
    this.bindingEpochByUserId.clear();
  }

  getBindingEpochForSession(sessionId: string): number | undefined {
    return this.bindingEpochBySessionId.get(sessionId);
  }

  getBindingEpochForUser(userId: string): number | undefined {
    return this.bindingEpochByUserId.get(userId);
  }

  rebindClientExclusive(userId: string, client: Client): void {
    const room = this.ctx.room;
    const oldClient = this.getBoundClient(userId);
    if (oldClient && oldClient.sessionId !== client.sessionId) {
      this.userIdBySessionId.delete(oldClient.sessionId);
      this.bindingEpochBySessionId.delete(oldClient.sessionId);
      try {
        room.sendTableMessageInternal(oldClient, "ERROR", {
          code: "SESSION_REPLACED",
          message: "Session replaced by a newer connection.",
        });
      } catch (err) {
        void err;
      }
      try {
        oldClient.leave(this.options.leaveCodeSessionReplaced);
      } catch (err) {
        void err;
      }
    }

    this.ctx.logger.info(
      {
        tableId: this.ctx.state.tableId,
        userId,
        oldSession: oldClient?.sessionId,
        newSession: client.sessionId,
      },
      "SESSION_REBOUND",
    );

    this.ctx.dealer.bindClient(userId, client);
    this.userIdBySessionId.set(client.sessionId, userId);
    const nextEpoch = (this.bindingEpochByUserId.get(userId) ?? 0) + 1;
    this.bindingEpochByUserId.set(userId, nextEpoch);
    this.bindingEpochBySessionId.set(client.sessionId, nextEpoch);
    room.updateMetadataCountsInternal();
  }

  isBindingEpochCurrent(userId: string, bindingEpoch?: number): boolean {
    if (typeof bindingEpoch !== "number") {
      return !this.bindingEpochByUserId.has(userId);
    }
    return this.bindingEpochByUserId.get(userId) === bindingEpoch;
  }

  getBoundClient(userId: string): Client | undefined {
    const dealerAny = this.ctx.dealer as unknown as { getClient?: (id: string) => Client | undefined };
    if (typeof dealerAny.getClient !== "function") return undefined;
    return dealerAny.getClient(userId);
  }

  isActiveBoundClient(userId: string, client: Client): boolean {
    const boundClient = this.getBoundClient(userId);
    return !boundClient || boundClient.sessionId === client.sessionId;
  }
}
