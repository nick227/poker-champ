import { createHash } from "node:crypto";
import type { HeroActionOptions, TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { snapshotMetrics } from "../dealer/metrics/snapshotMetrics.js";
import { logger } from "../../lib/logger.js";
import { OddsCoordinator } from "./OddsCoordinator.js";
import { calcHeadsUpTieOrBetterOuts } from "./OutsService.js";
import { calcPotOdds } from "./OddsService.js";

type HeroCalculations = NonNullable<TableSnapshotPayload["hero"]["calculations"]>;
type CalculationsMeta = NonNullable<TableSnapshotPayload["calculationsMeta"]>;
type Street = NonNullable<CalculationsMeta["street"]>;

type CalcPlayer = {
  id: string;
  seat: number;
  status: string;
  stackCents: number;
  roundBetCents: number;
  committedCents: number;
};

export class HandCalculationsCoordinator {
  private readonly oddsCoordinator = new OddsCoordinator(200);
  private currentByUserId = new Map<string, HeroCalculations>();
  private currentMeta: CalculationsMeta | undefined = undefined;
  private currentInputHash: string | undefined = undefined;
  private oddsComputeFailureTotal = 0;

  refresh(params: {
    tableId: string;
    handId: string;
    street: Street;
    board: string[];
    potCents: number;
    roundCurrentBetCents: number;
    minRaiseCents: number;
    toActSeat: number;
    players: CalcPlayer[];
    holeCardsByPlayerId: Map<string, string[]>;
    getActionOptions: (userId: string) => HeroActionOptions | undefined;
  }) {
    const { handId, street } = params;
    if (!handId || street === "WAITING") {
      this.currentByUserId.clear();
      this.currentMeta = undefined;
      this.currentInputHash = undefined;
      return;
    }

    const inputHash = this.buildInputHash(params);
    if (this.currentInputHash === inputHash) return;

    snapshotMetrics.recordEquityRefresh();
    const nowTs = Date.now();

    try {
      const playersEligibleForEquity = params.players.filter(
        (p) => p.status !== "FOLDED" && p.status !== "OUT" && p.status !== "ABANDONED"
      );
      const playersConsidered = playersEligibleForEquity.length;

      const equityPlayers = playersEligibleForEquity
        .map((p) => ({ id: p.id, cards: params.holeCardsByPlayerId.get(p.id) ?? [] }))
        .filter((p) => p.cards.length === 2);

      const equityByUserId = new Map<string, number>();
      if (equityPlayers.length >= 2) {
        const { equity } = this.oddsCoordinator.getEquitySync({
          handId,
          street,
          board: params.board,
          players: equityPlayers,
        });
        for (let i = 0; i < equityPlayers.length; i++) {
          const userId = equityPlayers[i]?.id;
          const raw = equity.equitiesPct[i];
          if (!userId || typeof raw !== "number" || !Number.isFinite(raw)) continue;
          equityByUserId.set(userId, Math.max(0, Math.min(100, Math.round(raw))));
        }
      } else if (equityPlayers.length === 1) {
        equityByUserId.set(equityPlayers[0]!.id, 100);
      }

      const outsByUserId = new Map<string, number>();
      if ((street === "FLOP" || street === "TURN") && equityPlayers.length === 2) {
        const a = equityPlayers[0]!;
        const b = equityPlayers[1]!;
        outsByUserId.set(a.id, calcHeadsUpTieOrBetterOuts({
          street,
          board: params.board,
          heroCards: a.cards,
          villainCards: b.cards,
        }));
        outsByUserId.set(b.id, calcHeadsUpTieOrBetterOuts({
          street,
          board: params.board,
          heroCards: b.cards,
          villainCards: a.cards,
        }));
      }

      const nextByUserId = new Map<string, HeroCalculations>();
      for (const p of params.players) {
        if (p.status === "OUT" || p.status === "ABANDONED" || p.status === "FOLDED") continue;

        const actionOptions = params.getActionOptions(p.id);
        if (!actionOptions) continue;

        const toCallCents = actionOptions.callAmount;
        if (!Number.isFinite(toCallCents) || toCallCents < 0) continue;

        nextByUserId.set(
          p.id,
          {
            mode: "SHOWDOWN_ANALYSIS",
            equityPct: equityByUserId.get(p.id),
            potOddsPct: Math.round(calcPotOdds(params.potCents, toCallCents) * 100),
            outs: outsByUserId.get(p.id),
            updatedAtTs: nowTs,
          } as HeroCalculations,
        );
      }

      this.currentByUserId = nextByUserId;
      this.currentMeta = {
        computedAtTs: nowTs,
        street,
        playersConsidered,
        stateHash: inputHash,
      };
      this.currentInputHash = inputHash;
    } catch (err) {
      this.oddsComputeFailureTotal++;
      logger.warn(
        { err, tableId: params.tableId, handId, odds_compute_failure_total: this.oddsComputeFailureTotal },
        "CALCULATIONS_COMPUTE_FAILED"
      );

      const staleByUserId = new Map<string, HeroCalculations>();
      for (const p of params.players) {
        if (p.status === "OUT" || p.status === "ABANDONED" || p.status === "FOLDED") continue;
        const existing = this.currentByUserId.get(p.id);
        staleByUserId.set(p.id, {
          mode: existing?.mode ?? "SHOWDOWN_ANALYSIS",
          ...existing,
          stale: true,
          updatedAtTs: nowTs,
        });
      }
      this.currentByUserId = staleByUserId;
      this.currentMeta = {
        computedAtTs: nowTs,
        street,
        playersConsidered: params.players.filter(p => p.status !== "FOLDED" && p.status !== "OUT" && p.status !== "ABANDONED").length,
        stateHash: inputHash,
      };
      this.currentInputHash = inputHash;
    }
  }

  getForUser(userId: string): HeroCalculations | undefined {
    return this.currentByUserId.get(userId);
  }

  getMeta(): CalculationsMeta | undefined {
    return this.currentMeta;
  }

  private buildInputHash(params: {
    handId: string;
    street: Street;
    board: string[];
    potCents: number;
    roundCurrentBetCents: number;
    minRaiseCents: number;
    toActSeat: number;
    players: CalcPlayer[];
  }): string {
    const players = [...params.players]
      .map((p) => ({
        id: p.id,
        seat: p.seat,
        status: p.status,
        stackCents: p.stackCents,
        roundBetCents: p.roundBetCents,
        committedCents: p.committedCents,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));

    const calcInput = {
      handId: params.handId,
      street: params.street,
      potCents: params.potCents,
      roundCurrentBetCents: params.roundCurrentBetCents,
      minRaiseCents: params.minRaiseCents,
      toActSeat: params.toActSeat,
      board: params.board,
      players,
    };

    return createHash("sha1").update(JSON.stringify(calcInput)).digest("hex");
  }
}
