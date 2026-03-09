import type { PokerRoomContext } from "../types/PokerRoomTypes.js";

export class PokerRoomPresence {
  constructor(private readonly ctx: PokerRoomContext) {}

  addTablePresence(client: any, userId: string, displayName?: string): void {
    this.ctx.addTablePresence(client, userId, displayName);
  }

  removeTablePresence(userId: string): void {
    this.ctx.removeTablePresence(userId);
  }
}
