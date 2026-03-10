import type { HandLifecyclePlan } from "./HandLifecycleService.js";
import type { PlayerLifecyclePlan } from "./PlayerLifecycleService.js";
import type { SnapshotReason } from "./SnapshotService.js";

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
type HandEndedPlan = Extract<HandLifecyclePlan, { kind: "HAND_ENDED" }>;
type DeferredRemovalPlan = Extract<PlayerLifecyclePlan, { kind: "LIFECYCLE_DEFERRED_REMOVAL" }>;
type LifecycleExecutorDeps = {
  sendTableSnapshotToAll: (reason: SnapshotReason, actionId?: string) => Promise<void>;
  isDisposed?: () => boolean;
  flushSessionStatsOnly: () => void;
  maybeActForBot: () => void;
  transitionToWaiting: () => void;
  releasePendingSeats: () => Promise<void>;
  scheduleNextHand: (reason: string, delayMs?: number) => void;
  runHandEndedAwards: (plan: HandEndedPlan) => Promise<void>;
  onHandEndedAwardsFailed: (err: unknown) => void;
  onLifecycleDeferredRemoval: (plan: DeferredRemovalPlan) => void;
  startHand: () => Promise<void>;
  ensureHandAdvancingAfterPlayerRemoval: (removedSeat: number) => Promise<void>;
  finishHandByLastStanding: () => Promise<void>;
  advanceStreetOrShowdown: () => Promise<void>;
};

export class LifecycleExecutor {
  constructor(private readonly deps: LifecycleExecutorDeps) {}

  async executeHandLifecyclePlans(plans: HandLifecyclePlan[]): Promise<void> {
    if (this.deps.isDisposed?.()) return;
    for (const plan of plans) {
      switch (plan.kind) {
        case "EMIT_SNAPSHOT":
          if (plan.reason === "HAND_END") this.deps.flushSessionStatsOnly();
          await this.deps.sendTableSnapshotToAll(plan.reason, plan.actionId);
          break;
        case "DELAY":
          await delay(plan.ms);
          break;
        case "MAYBE_AUTOMATE_TURN":
          this.deps.maybeActForBot();
          break;
        case "TRANSITION_TO_WAITING":
          this.deps.transitionToWaiting();
          break;
        case "RELEASE_PENDING_SEATS":
          await this.deps.releasePendingSeats();
          break;
        case "SCHEDULE_NEXT_HAND":
          this.deps.scheduleNextHand(plan.reason, plan.delayMs ?? 0);
          break;
        case "HAND_ENDED":
          try {
            await this.deps.runHandEndedAwards(plan);
          } catch (err) {
            this.deps.onHandEndedAwardsFailed(err);
          }
          break;
        default:
          throw new Error("Unhandled hand lifecycle plan");
      }
    }
  }

  async executePlayerLifecyclePlans(plans: PlayerLifecyclePlan[]): Promise<void> {
    if (this.deps.isDisposed?.()) return;
    for (const plan of plans) {
      switch (plan.kind) {
        case "EMIT_SNAPSHOT":
          await this.deps.sendTableSnapshotToAll(plan.reason, plan.actionId);
          break;
        case "LIFECYCLE_DEFERRED_REMOVAL":
          this.deps.onLifecycleDeferredRemoval(plan);
          break;
        case "MAYBE_AUTOMATE_TURN":
          this.deps.maybeActForBot();
          break;
        case "START_HAND":
          await this.deps.startHand();
          break;
        case "ENSURE_HAND_ADVANCING_AFTER_PLAYER_REMOVAL":
          await this.deps.ensureHandAdvancingAfterPlayerRemoval(plan.removedSeat);
          break;
        case "RELEASE_PENDING_SEATS":
          await this.deps.releasePendingSeats();
          break;
        case "FINISH_HAND_BY_LAST_STANDING":
          await this.deps.finishHandByLastStanding();
          break;
        case "ADVANCE_STREET_OR_SHOWDOWN":
          await this.deps.advanceStreetOrShowdown();
          break;
        default:
          throw new Error("Unhandled player lifecycle plan");
      }
    }
  }
}
