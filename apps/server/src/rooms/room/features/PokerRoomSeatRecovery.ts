import type { PokerRoomContext } from "../types/PokerRoomTypes.js";

export class PokerRoomSeatRecovery {
  constructor(private readonly ctx: PokerRoomContext) {}

  async bootstrapPersistentSeatRecovery(): Promise<void> {
    await this.ctx.bootstrapPersistentSeatRecovery();
  }

  async runPersistentSeatCleanup(): Promise<void> {
    await this.ctx.runPersistentSeatCleanup();
  }
}
