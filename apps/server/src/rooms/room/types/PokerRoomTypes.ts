import type { Client } from "@colyseus/core";
import type { Dealer } from "../../../engine/Dealer.js";
import type { PokerState } from "../../../state/PokerState.js";
import { logger } from "../../../lib/logger.js";

// Architectural boundary: room services depend on this facade, never on PokerRoom directly.
// Keep this broad for low-churn extraction safety; tighten incrementally as services stabilize.
export type PokerRoomFacade = any;

export type PokerRoomContext = {
  room: PokerRoomFacade;
  roomId: string;
  dealer: Dealer;
  state: PokerState;
  logger: typeof logger;
  startStallMonitor(): void;
  updateCreateMetadata(cfg?: any): void;
  registerVoiceRelay(): void;
  setSessionEventUnbind(unbind: () => void): void;
  touchActivity(): void;
  bootstrapPersistentSeatRecovery(): Promise<void>;
  disposeRoom(): void;
  addTablePresence(client: Client, userId: string, displayName?: string): void;
  removeTablePresence(userId: string): void;
  handleEmptyStateChange(): void;
  scheduleIdleDispose(): void;
  runPersistentSeatCleanup(): Promise<void>;
  runSittingOutSweep(options?: { nowTs?: number; abandonedPurgeMs?: number }): Promise<{ purgedUserIds: string[] }>;
  seedInstantBots(
    presetId: "MULTIPLAYER_RING" | "HEADS_UP_BOT",
    targetBotCountOverride?: number,
  ): Promise<{ ok: boolean; added: number; target: number; reason?: string }>;
  maybeRemoveBotsIfNoHumans(): Promise<void>;
  purgeBotsForDelete(): void;
};

export interface PokerRoomAuthService {
  authenticate(client: Client, options: any, context: { token?: string; headers?: Headers }): Promise<any>;
}

export interface PokerRoomJoinServiceContract {
  handleJoin(client: Client, options: any, auth?: any): Promise<void>;
}

export interface PokerRoomLeaveServiceContract {
  handleLeave(client: Client, code?: number): Promise<void>;
}

export interface PokerRoomMessageRouterContract {
  registerAll(): void;
}

export interface PokerRoomLifecycleContract {
  setup(options?: { cfg?: any }): void;
  dispose(): void;
}
