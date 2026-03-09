import type { PokerRoomContext } from "../types/PokerRoomTypes.js";

export class PokerRoomBotService {
  constructor(private readonly ctx: PokerRoomContext) {}

  async seedInstantBots(presetId: "MULTIPLAYER_RING" | "HEADS_UP_BOT", targetBotCountOverride?: number): Promise<{ ok: boolean; added: number; target: number; reason?: string }> {
    return this.ctx.seedInstantBots(presetId, targetBotCountOverride);
  }

  async maybeRemoveBotsIfNoHumans(): Promise<void> {
    await this.ctx.maybeRemoveBotsIfNoHumans();
  }

  purgeBotsForDelete(): void {
    this.ctx.purgeBotsForDelete();
  }
}
