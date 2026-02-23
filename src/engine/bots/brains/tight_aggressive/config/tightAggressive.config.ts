import type {
  AxisDefinitionAuthoring,
  AxisFeatureKey,
  AxisMeta,
  BetSizeBucket,
  HandTier,
  PositionBucket,
  PostflopHandClass,
  PreflopNodeAuthoring,
  PressureBucket,
  Street,
  TightAggressiveConfigV1,
} from "../types.js";

const POSITIONS: readonly PositionBucket[] = ["EARLY", "MIDDLE", "LATE", "BLINDS"];
const PRESSURES: readonly PressureBucket[] = ["UNOPENED", "VS_RAISE", "VS_3BET_PLUS", "VS_ALLIN"];
const BET_SIZES: readonly Exclude<BetSizeBucket, "NONE">[] = ["SMALL", "MEDIUM", "LARGE", "MAX"];
const STREETS: readonly Street[] = ["FLOP", "TURN", "RIVER"];
const HAND_CLASSES: readonly PostflopHandClass[] = ["AIR", "WEAK_MADE", "STRONG_MADE"];

function makeHandTierByComboIndex(): HandTier[] {
  const sequence: HandTier[] = ["PREMIUM", "STRONG", "GOOD", "SPEC", "TRASH"];
  const out: HandTier[] = [];
  while (out.length < 169) {
    out.push(...sequence);
  }
  return out.slice(0, 169);
}

function makePreflopNode(id: string): PreflopNodeAuthoring {
  return {
    id,
    comboTierWeights: {
      PREMIUM: 100,
      STRONG: 70,
      GOOD: 40,
      SPEC: 15,
      TRASH: 0,
    },
    actionWeights: {
      FOLD: 10,
      CHECK: 5,
      CALL: 15,
      RAISE: 40,
      ALL_IN: 5,
    },
    sizingWeights: {
      OPEN_STD: 1,
      JAM: 1,
    },
  };
}

let nodeCounter = 0;
function nodeId(prefix: string): string {
  nodeCounter += 1;
  return `${prefix}_${nodeCounter}`;
}

function buildPreflopTable(): TightAggressiveConfigV1["preflop"]["table"] {
  const table = {} as TightAggressiveConfigV1["preflop"]["table"];
  for (const position of POSITIONS) {
    table[position] = {
      UNOPENED: makePreflopNode(nodeId(`preflop_${position}_UNOPENED`)),
      VS_RAISE: {} as TightAggressiveConfigV1["preflop"]["table"][PositionBucket]["VS_RAISE"],
      VS_3BET_PLUS: {} as TightAggressiveConfigV1["preflop"]["table"][PositionBucket]["VS_3BET_PLUS"],
      VS_ALLIN: {} as TightAggressiveConfigV1["preflop"]["table"][PositionBucket]["VS_ALLIN"],
    };
    for (const betSize of BET_SIZES) {
      table[position].VS_RAISE[betSize] = makePreflopNode(nodeId(`preflop_${position}_VS_RAISE_${betSize}`));
      table[position].VS_3BET_PLUS[betSize] = makePreflopNode(nodeId(`preflop_${position}_VS_3BET_PLUS_${betSize}`));
      table[position].VS_ALLIN[betSize] = makePreflopNode(nodeId(`preflop_${position}_VS_ALLIN_${betSize}`));
    }
  }

  // First intentional behavior slice: tight early unopened policy.
  table.EARLY.UNOPENED = {
    id: "pf_early_unopened",
    comboTierWeights: {
      PREMIUM: 1,
      STRONG: 0.6,
      GOOD: 0.25,
      SPEC: 0,
      TRASH: 0,
    },
    actionWeights: {
      RAISE: 3,
      CALL: 1,
    },
    sizingWeights: {
      OPEN_STD: 1,
    },
  };

  // Looser opens in late position.
  table.LATE.UNOPENED = {
    id: "pf_late_unopened",
    comboTierWeights: {
      PREMIUM: 1,
      STRONG: 0.9,
      GOOD: 0.7,
      SPEC: 0.4,
      TRASH: 0,
    },
    actionWeights: {
      RAISE: 4,
      CALL: 1,
    },
    sizingWeights: {
      OPEN_STD: 1,
    },
  };

  // Middle position sits between early and late.
  table.MIDDLE.UNOPENED = {
    id: "pf_middle_unopened",
    comboTierWeights: {
      PREMIUM: 1,
      STRONG: 0.8,
      GOOD: 0.5,
      SPEC: 0.2,
      TRASH: 0,
    },
    actionWeights: {
      RAISE: 4,
      CALL: 1,
    },
    sizingWeights: {
      OPEN_STD: 1,
    },
  };

  // Blinds unopened: loose-defend identity, call-heavy.
  // Note: SB/BB are currently represented as one shared BLINDS bucket.
  table.BLINDS.UNOPENED = {
    id: "pf_blinds_unopened",
    comboTierWeights: {
      PREMIUM: 1,
      STRONG: 0.9,
      GOOD: 0.7,
      SPEC: 0.4,
      TRASH: 0,
    },
    actionWeights: {
      CALL: 3,
      RAISE: 1,
    },
    sizingWeights: {
      OPEN_STD: 1,
    },
  };

  // Tight defend in early position versus a small raise.
  table.EARLY.VS_RAISE.SMALL = {
    id: "pf_early_vs_raise_small",
    comboTierWeights: {
      PREMIUM: 1,
      STRONG: 0.7,
      GOOD: 0.25,
      SPEC: 0,
      TRASH: 0,
    },
    actionWeights: {
      CALL: 2,
      RAISE: 1,
    },
  };

  // Slightly looser defend in middle versus small raise.
  table.MIDDLE.VS_RAISE.SMALL = {
    id: "pf_middle_vs_raise_small",
    comboTierWeights: {
      PREMIUM: 1,
      STRONG: 0.8,
      GOOD: 0.35,
      SPEC: 0.1,
      TRASH: 0,
    },
    actionWeights: {
      CALL: 2,
      RAISE: 1,
    },
  };

  // One medium-size raise bucket for v1: tighter than SMALL.
  table.MIDDLE.VS_RAISE.MEDIUM = {
    id: "pf_middle_vs_raise_medium",
    comboTierWeights: {
      PREMIUM: 1,
      STRONG: 0.6,
      GOOD: 0.2,
      SPEC: 0,
      TRASH: 0,
    },
    actionWeights: {
      CALL: 2,
      RAISE: 1,
    },
  };

  // Versus all-in pressure: premiums dominate, strong continues selectively, weaker folds out.
  for (const position of POSITIONS) {
    for (const betSize of BET_SIZES) {
      table[position].VS_ALLIN[betSize] = {
        id: nodeId(`pf_${position}_vs_allin_${betSize}`),
        comboTierWeights: {
          PREMIUM: 1,
          STRONG: 0.3,
          GOOD: 0,
          SPEC: 0,
          TRASH: 0,
        },
        actionWeights: {
          FOLD: 1,
          CALL: 1,
          ALL_IN: 2,
        },
        sizingWeights: {
          JAM: 1,
        },
      };
    }
  }

  return table;
}

function buildPostflopTable(): TightAggressiveConfigV1["postflop"]["table"] {
  const table = {} as TightAggressiveConfigV1["postflop"]["table"];
  for (const street of STREETS) {
    table[street] = {} as TightAggressiveConfigV1["postflop"]["table"][Street];
    for (const pressure of PRESSURES) {
      table[street][pressure] = {} as TightAggressiveConfigV1["postflop"]["table"][Street][PressureBucket];
      for (const handClass of HAND_CLASSES) {
        table[street][pressure][handClass] = makePhase0PostflopNode(street, pressure, handClass);
      }
    }
  }
  return table;
}

function makePhase0PostflopNode(
  street: Street,
  pressure: PressureBucket,
  handClass: PostflopHandClass,
): TightAggressiveConfigV1["postflop"]["table"][Street][PressureBucket][PostflopHandClass] {
  if (pressure === "UNOPENED") {
    if (handClass === "AIR") {
      return {
        id: nodeId(`postflop_${street}_UNOPENED_AIR`),
        actionWeights: { CHECK: 4, BET: 1 },
        sizingWeights: { CBET_SMALL: 1, CBET_STD: 1 },
      };
    }
    if (handClass === "WEAK_MADE") {
      return {
        id: nodeId(`postflop_${street}_UNOPENED_WEAK_MADE`),
        actionWeights: { CHECK: 3, BET: 2, CALL: 3, FOLD: 1 },
        sizingWeights: { CBET_SMALL: 1, CBET_STD: 1 },
      };
    }
    return {
      id: nodeId(`postflop_${street}_UNOPENED_STRONG_MADE`),
      actionWeights: { BET: 4, CHECK: 1, CALL: 2, RAISE: 2, ALL_IN: street === "RIVER" ? 1 : 0 },
      sizingWeights: { CBET_STD: 1, JAM: street === "RIVER" ? 1 : 0 },
    };
  }

  // Phase 0 primary implemented pressure: VS_RAISE
  if (pressure === "VS_RAISE") {
    if (handClass === "AIR") {
      return {
        id: nodeId(`postflop_${street}_VS_RAISE_AIR`),
        actionWeights: { FOLD: 4, CALL: 1 },
      };
    }
    if (handClass === "WEAK_MADE") {
      return {
        id: nodeId(`postflop_${street}_VS_RAISE_WEAK_MADE`),
        actionWeights: { CALL: 3, FOLD: 1 },
      };
    }
    return {
      id: nodeId(`postflop_${street}_VS_RAISE_STRONG_MADE`),
      actionWeights: { CALL: 2, RAISE: 2, ALL_IN: street === "RIVER" ? 1 : 0 },
      sizingWeights: { CBET_STD: 1, JAM: street === "RIVER" ? 1 : 0 },
    };
  }

  // Phase 0 fallback for VS_3BET_PLUS and VS_ALLIN: tighten relative to VS_RAISE.
  if (handClass === "AIR") {
    return {
      id: nodeId(`postflop_${street}_${pressure}_AIR`),
      actionWeights: { FOLD: 5, CALL: 1 },
    };
  }
  if (handClass === "WEAK_MADE") {
    return {
      id: nodeId(`postflop_${street}_${pressure}_WEAK_MADE`),
      actionWeights: { CALL: 2, FOLD: 2 },
    };
  }
  return {
    id: nodeId(`postflop_${street}_${pressure}_STRONG_MADE`),
    actionWeights: { CALL: 2, RAISE: 2, ALL_IN: 1 },
    sizingWeights: { CBET_STD: 1, JAM: 1 },
  };
}

function activeAxis(
  id: string,
  order: number,
  feature: AxisFeatureKey,
  buckets: AxisDefinitionAuthoring["buckets"],
  strength = 1,
): AxisDefinitionAuthoring {
  return { id, order, feature, strength, buckets };
}

function neutralAxis(id: string, order: number, feature: AxisFeatureKey): AxisDefinitionAuthoring {
  return { id, order, feature, strength: 1, buckets: {} };
}

function buildAxes(): TightAggressiveConfigV1["axes"] {
  return [
    activeAxis(
      "player_count",
      10,
      "playerCountBucket",
      {
        HU: { BET: 1.25, CALL: 1.15, RAISE: 1.1 },
        MW2: { BET: 1, CALL: 1, RAISE: 1 },
        MW3_PLUS: { BET: 0.7, CALL: 0.85, RAISE: 0.65, FOLD: 1.2 },
      },
      1.1,
    ),
    activeAxis(
      "position_postflop",
      15,
      "positionPostflopBucket",
      {
        IN_POSITION: { BET: 1.15, RAISE: 1.1 },
        OUT_OF_POSITION: { CALL: 1.05, BET: 0.9, RAISE: 0.9 },
      },
      1,
    ),
    activeAxis(
      "stack_depth",
      20,
      "stackBucket",
      {
        SHORT: { ALL_IN: 1.35, CALL: 0.9, BET: 0.9 },
        MEDIUM: { BET: 1, RAISE: 1, CALL: 1 },
        DEEP: { BET: 1.15, RAISE: 1.1, ALL_IN: 0.85 },
      },
      1,
    ),
    activeAxis(
      "facing_pressure",
      25,
      "facingPressureBucket",
      {
        UNOPENED: { BET: 1.15, RAISE: 1.1 },
        VS_RAISE: { CALL: 1.05, FOLD: 1.05 },
        VS_3BET_PLUS: { CALL: 0.85, FOLD: 1.2, RAISE: 0.8 },
        VS_ALLIN: { FOLD: 1.25, CALL: 0.8, ALL_IN: 0.85 },
      },
      1.05,
    ),
    activeAxis(
      "initiative",
      30,
      "initiativeBucket",
      {
        HAS_INITIATIVE: { BET: 1.15, RAISE: 1.1 },
        NO_INITIATIVE: { CALL: 1.1, BET: 0.9, RAISE: 0.9 },
      },
      1,
    ),
    activeAxis(
      "street",
      35,
      "streetBucket",
      {
        FLOP: { BET: 1.1, RAISE: 1.05 },
        TURN: { BET: 1, RAISE: 1, CALL: 1.05 },
        RIVER: { BET: 0.9, RAISE: 0.9, FOLD: 1.1 },
      },
      1,
    ),
    neutralAxis("initiative_street_count", 40, "initiativeStreetCountBucket"),
    activeAxis(
      "spr",
      45,
      "sprBucket",
      {
        LOW: { ALL_IN: 1.2, BET: 1.1, CALL: 0.95 },
        MID: { BET: 1, CALL: 1, RAISE: 1 },
        HIGH: { BET: 0.95, CALL: 1.05, RAISE: 0.95 },
      },
      1,
    ),
    activeAxis(
      "pot_odds",
      50,
      "potOddsBucket",
      {
        EXCELLENT: { CALL: 1.35 },
        GOOD: { CALL: 1.15 },
        NEUTRAL: { CALL: 1 },
        BAD: { CALL: 0.65, FOLD: 1.25 },
      },
      1.05,
    ),
    neutralAxis("board_paired", 55, "boardPairedBucket"),
    neutralAxis("board_wetness", 60, "boardWetnessBucket"),
    neutralAxis("board_monotone", 65, "boardMonotoneBucket"),
    neutralAxis("straight_connectivity", 70, "straightConnectivityBucket"),
    neutralAxis("has_overpair", 75, "hasOverpairBucket"),
    neutralAxis("top_pair_kicker", 80, "topPairKickerStrengthBucket"),
    neutralAxis("made_hand_strength", 85, "madeHandStrengthBucket"),
    neutralAxis("blocker_strength", 90, "blockerStrengthBucket"),
    neutralAxis("opponent_tightness", 95, "opponentTightnessBucket"),
    neutralAxis("opponent_aggression", 100, "opponentAggressionBucket"),
    neutralAxis("recent_aggression_history", 105, "recentAggressionHistoryBucket"),
    neutralAxis("table_image", 110, "tableImageBucket"),
    neutralAxis("bet_size_relative_to_stack", 115, "betSizeRelativeToStackBucket"),
    neutralAxis("call_cost_relative_to_stack", 120, "callCostRelativeToStackBucket"),
    neutralAxis("tournament_icm_pressure", 125, "tournamentIcmPressureBucket"),
    neutralAxis("multiway_equity_penalty", 130, "multiwayEquityPenaltyBucket"),
    neutralAxis("risk_tolerance", 135, "riskToleranceBucket"),
    neutralAxis("tilt_level", 140, "tiltLevelBucket"),
    neutralAxis("time_pressure", 145, "timePressureBucket"),
    activeAxis(
      "open_opportunity",
      150,
      "openOpportunityBucket",
      {
        FIRST_TO_ACT: { RAISE: 1.1, CALL: 0.95 },
        ISOLATE: { RAISE: 1.15, BET: 1.1 },
        SQUEEZE: { RAISE: 1.2, ALL_IN: 1.05, CALL: 0.9 },
      },
      1,
    ),
    neutralAxis("squeeze_opportunity", 155, "squeezeOpportunityBucket"),
    neutralAxis("limp_present", 160, "limpPresentBucket"),
    activeAxis(
      "draws",
      165,
      "drawBucket",
      {
        NONE: { CALL: 1, BET: 1 },
        FLUSH_DRAW: { CALL: 1.3, BET: 1.2 },
        OPEN_ENDED: { CALL: 1.2, BET: 1.1 },
        COMBO_DRAW: { CALL: 1.4, BET: 1.25 },
      },
      0.9,
    ),
  ];
}

function buildAxisMeta(): AxisMeta[] {
  return [
    { id: "player_count", tier: "ACTIVE", rationale: "Core multiway tightening mechanic." },
    { id: "position_postflop", tier: "ACTIVE", rationale: "Postflop IP/OOP expression." },
    { id: "stack_depth", tier: "ACTIVE", rationale: "Stack depth materially changes aggression." },
    { id: "facing_pressure", tier: "ACTIVE", rationale: "Escalating pressure should tighten continues." },
    { id: "initiative", tier: "ACTIVE", rationale: "Initiative drives c-bet/barrel tendencies." },
    { id: "street", tier: "ACTIVE", rationale: "Street-level bluff/value shift." },
    { id: "initiative_street_count", tier: "NEUTRAL", rationale: "Reserved for future barrel pacing." },
    { id: "spr", tier: "ACTIVE", rationale: "Low SPR increases commitment behavior." },
    { id: "pot_odds", tier: "ACTIVE", rationale: "Core call-versus-fold math." },
    { id: "board_paired", tier: "FUTURE", rationale: "Phase 2 board texture axis." },
    { id: "board_wetness", tier: "FUTURE", rationale: "Phase 2 board texture axis." },
    { id: "board_monotone", tier: "FUTURE", rationale: "Phase 2 board texture axis." },
    { id: "straight_connectivity", tier: "FUTURE", rationale: "Phase 2 board texture axis." },
    { id: "has_overpair", tier: "FUTURE", rationale: "Advanced hand-structure signal." },
    { id: "top_pair_kicker", tier: "FUTURE", rationale: "Advanced hand-structure signal." },
    { id: "made_hand_strength", tier: "FUTURE", rationale: "Advanced hand-shape refinements." },
    { id: "blocker_strength", tier: "FUTURE", rationale: "Advanced blocker-based bluff tuning." },
    { id: "opponent_tightness", tier: "FUTURE", rationale: "Requires stable opponent modeling." },
    { id: "opponent_aggression", tier: "FUTURE", rationale: "Requires stable opponent modeling." },
    { id: "recent_aggression_history", tier: "FUTURE", rationale: "Requires temporal memory model." },
    { id: "table_image", tier: "FUTURE", rationale: "Requires global strategic memory." },
    { id: "bet_size_relative_to_stack", tier: "NEUTRAL", rationale: "Overlaps with pot odds/stack for v1." },
    { id: "call_cost_relative_to_stack", tier: "NEUTRAL", rationale: "Overlaps with pot odds/stack for v1." },
    { id: "tournament_icm_pressure", tier: "FUTURE", rationale: "Tournament-specific, not cash v1." },
    { id: "multiway_equity_penalty", tier: "NEUTRAL", rationale: "Neutral in v1 to avoid double-counting with player_count." },
    { id: "risk_tolerance", tier: "FUTURE", rationale: "Personality flavor; deferred in v1." },
    { id: "tilt_level", tier: "FUTURE", rationale: "Behavioral state modeling deferred." },
    { id: "time_pressure", tier: "FUTURE", rationale: "Timing model deferred." },
    { id: "open_opportunity", tier: "ACTIVE", rationale: "Preflop opportunity shaping." },
    { id: "squeeze_opportunity", tier: "NEUTRAL", rationale: "Neutral in v1; open_opportunity carries squeeze flavor." },
    { id: "limp_present", tier: "NEUTRAL", rationale: "Held neutral until limp-heavy tuning pass." },
    { id: "draws", tier: "ACTIVE", rationale: "Core draw continuation realism." },
  ];
}

const tightAggressiveConfig: TightAggressiveConfigV1 = {
  version: 1,
  metadata: {
    id: "tight_aggressive_v1",
    label: "Tight Aggressive (Seed)",
    description: "Bootstrap config for tight-aggressive brain plumbing.",
  },
  normalization: {
    maxWeight: 100,
    zeroIsFoldGate: true,
  },
  preflop: {
    comboIndexMap: "STANDARD_169_V1",
    handTierByComboIndex: makeHandTierByComboIndex(),
    table: buildPreflopTable(),
  },
  postflop: {
    evaluator: "BEST5_V1",
    table: buildPostflopTable(),
  },
  axes: buildAxes(),
  axisMeta: buildAxisMeta(),
  sizing: {
    recipes: "CASH_STANDARD_V1",
  },
  safety: {
    fallbackActionOrder: ["CHECK", "FOLD", "CALL", "ALL_IN"],
  },
  debug: {
    emitDecisionTrace: false,
  },
};

export default tightAggressiveConfig;
