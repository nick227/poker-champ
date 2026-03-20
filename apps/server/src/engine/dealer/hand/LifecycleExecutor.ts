import type { HandLifecyclePlan } from "./HandLifecycleService.js";
import type { PlayerLifecyclePlan } from "./PlayerLifecycleService.js";
import type { SnapshotReason } from "./SnapshotService.js";
import { logger } from "../../../lib/logger.js";

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
type HandEndedPlan = Extract<HandLifecyclePlan, { kind: "HAND_ENDED" }>;
type DeferredRemovalPlan = Extract<PlayerLifecyclePlan, { kind: "LIFECYCLE_DEFERRED_REMOVAL" }>;
type LifecycleExecutorDeps = {
  sendTableSnapshotToAll: (reason: SnapshotReason, actionId?: string) => Promise<void>;
  isDisposed?: () => boolean;
  flushSessionStatsOnly: () => void;
  maybeActForBot: () => Promise<void>;
  getLifecycleLogContext: () => { tableId: string; handId: string; street: string };
  onLifecyclePlanCompleted?: (args: {
    scope: "hand" | "player";
    plan: HandLifecyclePlan["kind"] | PlayerLifecyclePlan["kind"];
    context: { tableId: string; handId: string; street: string };
  }) => void;
  onLifecyclePlanTiming?: (args: {
    handId: string;
    street: string;
    plan: HandLifecyclePlan["kind"] | PlayerLifecyclePlan["kind"];
    durationMs: number;
    reason?: string | null;
    actionId?: string | null;
    potCents?: number | null;
    delayMs?: number | null;
  }) => void;
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

  private logTimedStep(
    context: { tableId: string; handId: string; street: string },
    plan: HandLifecyclePlan["kind"] | PlayerLifecyclePlan["kind"],
    startedAt: number,
    extra?: Record<string, unknown>,
  ): void {
    const durationMs = Date.now() - startedAt;
    logger.info(
      {
        ...context,
        plan,
        durationMs,
        ...extra,
      },
      "LIFECYCLE_PLAN_TIMING",
    );
    this.deps.onLifecyclePlanTiming?.({
      handId: context.handId,
      street: context.street,
      plan,
      durationMs,
      reason: typeof extra?.reason === "string" ? extra.reason : null,
      actionId: typeof extra?.actionId === "string" ? extra.actionId : null,
      potCents: typeof extra?.potCents === "number" ? extra.potCents : null,
      delayMs: typeof extra?.delayMs === "number" ? extra.delayMs : null,
    });
  }

  async executeHandLifecyclePlans(plans: HandLifecyclePlan[]): Promise<void> {
    if (this.deps.isDisposed?.()) return;
    for (const plan of plans) {
      const context = this.deps.getLifecycleLogContext();
      logger.info({ ...context, plan: plan.kind }, "LIFECYCLE_PLAN_EXECUTED");
      switch (plan.kind) {
        case "EMIT_SNAPSHOT":
          {
          const startedAt = Date.now();
          if (plan.reason === "HAND_END") this.deps.flushSessionStatsOnly();
          await this.deps.sendTableSnapshotToAll(plan.reason, plan.actionId);
          this.logTimedStep(context, plan.kind, startedAt, { reason: plan.reason, actionId: plan.actionId ?? null });
          break;
          }
        case "DELAY":
          {
          const startedAt = Date.now();
          if (plan.ms > 0) {
            await delay(plan.ms);
          }
          this.logTimedStep(context, plan.kind, startedAt, { delayMs: plan.ms });
          break;
          }
        case "MAYBE_AUTOMATE_TURN":
          {
          const startedAt = Date.now();
          await this.deps.maybeActForBot();
          this.logTimedStep(context, plan.kind, startedAt);
          break;
          }
        case "TRANSITION_TO_WAITING":
          {
          const startedAt = Date.now();
          this.deps.transitionToWaiting();
          this.logTimedStep(context, plan.kind, startedAt);
          break;
          }
        case "RELEASE_PENDING_SEATS":
          {
          const startedAt = Date.now();
          await this.deps.releasePendingSeats();
          this.logTimedStep(context, plan.kind, startedAt);
          break;
          }
        case "SCHEDULE_NEXT_HAND":
          {
          const startedAt = Date.now();
          this.deps.scheduleNextHand(plan.reason, plan.delayMs ?? 0);
          this.logTimedStep(context, plan.kind, startedAt, { reason: plan.reason, delayMs: plan.delayMs ?? 0 });
          break;
          }
        case "HAND_ENDED":
          {
          const startedAt = Date.now();
          try {
            await this.deps.runHandEndedAwards(plan);
          } catch (err) {
            this.deps.onHandEndedAwardsFailed(err);
          } finally {
            this.logTimedStep(context, plan.kind, startedAt, { reason: plan.reason, potCents: plan.outcome.potCents });
          }
          break;
          }
        default:
          throw new Error("Unhandled hand lifecycle plan");
      }
      this.deps.onLifecyclePlanCompleted?.({
        scope: "hand",
        plan: plan.kind,
        context: this.deps.getLifecycleLogContext(),
      });
    }
  }

  async executePlayerLifecyclePlans(plans: PlayerLifecyclePlan[]): Promise<void> {
    if (this.deps.isDisposed?.()) return;
    for (const plan of plans) {
      const context = this.deps.getLifecycleLogContext();
      logger.info({ ...context, plan: plan.kind }, "LIFECYCLE_PLAN_EXECUTED");
      switch (plan.kind) {
        case "EMIT_SNAPSHOT":
          {
          const startedAt = Date.now();
          await this.deps.sendTableSnapshotToAll(plan.reason, plan.actionId);
          this.logTimedStep(context, plan.kind, startedAt, { reason: plan.reason, actionId: plan.actionId ?? null });
          break;
          }
        case "LIFECYCLE_DEFERRED_REMOVAL":
          {
          const startedAt = Date.now();
          this.deps.onLifecycleDeferredRemoval(plan);
          this.logTimedStep(context, plan.kind, startedAt, { userId: plan.userId, reason: plan.reason });
          break;
          }
        case "MAYBE_AUTOMATE_TURN":
          {
          const startedAt = Date.now();
          await this.deps.maybeActForBot();
          this.logTimedStep(context, plan.kind, startedAt);
          break;
          }
        case "START_HAND":
          {
          const startedAt = Date.now();
          await this.deps.startHand();
          this.logTimedStep(context, plan.kind, startedAt);
          break;
          }
        case "ENSURE_HAND_ADVANCING_AFTER_PLAYER_REMOVAL":
          {
          const startedAt = Date.now();
          await this.deps.ensureHandAdvancingAfterPlayerRemoval(plan.removedSeat);
          this.logTimedStep(context, plan.kind, startedAt, { removedSeat: plan.removedSeat });
          break;
          }
        case "RELEASE_PENDING_SEATS":
          {
          const startedAt = Date.now();
          await this.deps.releasePendingSeats();
          this.logTimedStep(context, plan.kind, startedAt);
          break;
          }
        case "FINISH_HAND_BY_LAST_STANDING":
          {
          const startedAt = Date.now();
          await this.deps.finishHandByLastStanding();
          this.logTimedStep(context, plan.kind, startedAt);
          break;
          }
        case "ADVANCE_STREET_OR_SHOWDOWN":
          {
          const startedAt = Date.now();
          await this.deps.advanceStreetOrShowdown();
          this.logTimedStep(context, plan.kind, startedAt);
          break;
          }
        default:
          throw new Error("Unhandled player lifecycle plan");
      }
      this.deps.onLifecyclePlanCompleted?.({
        scope: "player",
        plan: plan.kind,
        context: this.deps.getLifecycleLogContext(),
      });
    }
  }
}
