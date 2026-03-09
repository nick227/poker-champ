import type { PokerRoomContext } from "../types/PokerRoomTypes.js";

export class PokerRoomStallMonitor {
  constructor(private readonly ctx: PokerRoomContext) {}

  start(): void {
    this.ctx.startStallMonitor();
  }

  stop(): void {
    // stop is handled by room dispose path; explicit stop hook remains for API symmetry.
  }
}
