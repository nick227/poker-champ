import type { Client } from "@colyseus/core";
import type { PokerRoomContext, PokerRoomAuthService } from "./types/PokerRoomTypes.js";

export class PokerRoomAuthAdapter implements PokerRoomAuthService {
  constructor(private readonly ctx: PokerRoomContext) {}

  async authenticate(client: Client, options: any, context: { token?: string; headers?: Headers }): Promise<any> {
    const room = this.ctx.room;
    return room.authenticateInternal(client, options, context);
  }
}
