import { logger } from "../../lib/logger.js";
import { PokerRoomAuthAdapter } from "./PokerRoomAuthAdapter.js";
import { PokerRoomJoinService } from "./PokerRoomJoinService.js";
import { PokerRoomLeaveService } from "./PokerRoomLeaveService.js";
import { PokerRoomLifecycle } from "./PokerRoomLifecycle.js";
import { PokerRoomMessageRouter } from "./PokerRoomMessageRouter.js";
import { PokerRoomSessionManager } from "./PokerRoomSessionManager.js";
import { PokerRoomBotService } from "./features/PokerRoomBotService.js";
import { PokerRoomIdleManager } from "./features/PokerRoomIdleManager.js";
import { PokerRoomPresence } from "./features/PokerRoomPresence.js";
import { PokerRoomSeatRecovery } from "./features/PokerRoomSeatRecovery.js";
import { PokerRoomStallMonitor } from "./features/PokerRoomStallMonitor.js";
import { registerVoiceRelay } from "../voice/register-voice-relay.js";
import type { PokerRoomContext, PokerRoomFacade } from "./types/PokerRoomTypes.js";

export class PokerRoomController {
  readonly context: PokerRoomContext;
  readonly session: PokerRoomSessionManager;
  readonly auth: PokerRoomAuthAdapter;
  readonly join: PokerRoomJoinService;
  readonly leave: PokerRoomLeaveService;
  readonly router: PokerRoomMessageRouter;
  readonly lifecycle: PokerRoomLifecycle;
  readonly presence: PokerRoomPresence;
  readonly idle: PokerRoomIdleManager;
  readonly seatRecovery: PokerRoomSeatRecovery;
  readonly stall: PokerRoomStallMonitor;
  readonly bots: PokerRoomBotService;

  constructor(private readonly room: PokerRoomFacade) {
    this.context = {
      room,
      roomId: room.roomId,
      get dealer() {
        return room.dealerRef;
      },
      state: room.state,
      logger,
      startStallMonitor: () => room.startStallMonitorInternal(),
      updateCreateMetadata: (cfg?: unknown) =>
        room.updateCreateMetadataInternal(
          cfg && typeof cfg === "object" ? (cfg as Parameters<typeof room.updateCreateMetadataInternal>[0]) : undefined,
        ),
      registerVoiceRelay: () => registerVoiceRelay(room),
      setSessionEventUnbind: (unbind: () => void) => room.setSessionEventUnbindInternal(unbind),
      touchActivity: () => room.touchActivityInternal(),
      bootstrapPersistentSeatRecovery: () => room.bootstrapPersistentSeatRecoveryInternal(),
      disposeRoom: () => room.disposeInternal(),
      addTablePresence: (client, userId, displayName) => room.addTablePresenceInternal(client, userId, displayName),
      removeTablePresence: (userId) => room.removeTablePresenceInternal(userId),
      handleEmptyStateChange: () => room.handleEmptyStateChangeInternal(),
      scheduleIdleDispose: () => room.scheduleIdleDisposeInternal(),
      runPersistentSeatCleanup: () => room.runPersistentSeatCleanupInternal(),
      runSittingOutSweep: (options) => room.runSittingOutSweepInternal(options),
      seedInstantBots: (presetId, targetBotCountOverride) => room.seedInstantBotsInternal(presetId, targetBotCountOverride),
      maybeStartPendingInstantGameSeed: () => room.maybeStartPendingInstantGameSeedInternal(),
      maybeRemoveBotsIfNoHumans: () => room.maybeRemoveBotsIfNoHumansInternal(),
      purgeBotsForDelete: () => room.purgeBotsForDeleteInternal(),
    };

    this.session = new PokerRoomSessionManager(this.context, {
      leaveCodeSessionReplaced: room.leaveCodeSessionReplaced,
      userIdBySessionId: room.userIdBySessionId,
      bindingEpochByUserId: room.bindingEpochByUserId,
      bindingEpochBySessionId: room.bindingEpochBySessionId,
    });
    this.auth = new PokerRoomAuthAdapter(this.context);
    this.join = new PokerRoomJoinService(this.context, this.session);
    this.leave = new PokerRoomLeaveService(this.context, this.session);
    this.router = new PokerRoomMessageRouter(this.context, this.session);
    this.lifecycle = new PokerRoomLifecycle(this.context);

    this.presence = new PokerRoomPresence(this.context);
    this.idle = new PokerRoomIdleManager(this.context);
    this.seatRecovery = new PokerRoomSeatRecovery(this.context);
    this.stall = new PokerRoomStallMonitor(this.context);
    this.bots = new PokerRoomBotService(this.context);
  }

  setupLifecycle(options?: { cfg?: unknown }): void {
    this.lifecycle.setup(options);
  }

  setupMessageHandlers(): void {
    this.router.registerAll();
  }
}
