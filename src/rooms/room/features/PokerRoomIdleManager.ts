import type { PokerRoomContext } from "../types/PokerRoomTypes.js";

export class PokerRoomIdleManager {
  constructor(private readonly ctx: PokerRoomContext) {}

  touchActivity(): void {
    this.ctx.touchActivity();
  }

  handleEmptyStateChange(): void {
    this.ctx.handleEmptyStateChange();
  }

  scheduleIdleDispose(): void {
    this.ctx.scheduleIdleDispose();
  }
}
