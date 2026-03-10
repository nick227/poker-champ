import { sessionEvents } from "../../engine/auth/SessionEvents.js";
import type { PokerRoomContext, PokerRoomLifecycleContract } from "./types/PokerRoomTypes.js";

export class PokerRoomLifecycle implements PokerRoomLifecycleContract {
  constructor(private readonly ctx: PokerRoomContext) {}

  setup(options?: { cfg?: unknown }): void {
    this.ctx.startStallMonitor();
    this.ctx.updateCreateMetadata(options?.cfg);
    this.ctx.registerVoiceRelay();

    const onBan = async (payload: { userId: string }) => {
      await this.ctx.room.kickUserByAdmin(payload.userId, "BANNED");
    };
    sessionEvents.on("user.banned", onBan);
    this.ctx.setSessionEventUnbind(() => sessionEvents.off("user.banned", onBan));

    this.ctx.logger.info({ roomId: this.ctx.roomId, tableId: this.ctx.state.tableId }, "PokerRoom created");
    this.ctx.touchActivity();
    void this.ctx.bootstrapPersistentSeatRecovery();
  }

  dispose(): void {
    this.ctx.disposeRoom();
  }
}
