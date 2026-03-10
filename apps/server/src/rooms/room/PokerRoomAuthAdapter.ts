import type { Client } from "@colyseus/core";
import type { PokerRoomContext, PokerRoomAuthService } from "./types/PokerRoomTypes.js";

export class PokerRoomAuthAdapter implements PokerRoomAuthService {
  constructor(private readonly ctx: PokerRoomContext) {}

  async authenticate(client: Client, options: unknown, context: { token?: string; headers?: Headers }): Promise<unknown> {
    const room = this.ctx.room;
    return room.authenticateInternal(client, options, context);
  }
}
