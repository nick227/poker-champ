export type PositionBucket = "EARLY" | "MIDDLE" | "LATE" | "BLINDS";
export type PositionPostflopBucket = "IN_POSITION" | "OUT_OF_POSITION";
export type PressureBucket = "UNOPENED" | "VS_RAISE" | "VS_3BET_PLUS" | "VS_ALLIN";
export type BetSizeBucket = "NONE" | "SMALL" | "MEDIUM" | "LARGE" | "MAX";
export type StackBucket = "SHORT" | "MEDIUM" | "DEEP";
export type PlayerCountBucket = "HU" | "MW2" | "MW3_PLUS";
export type Street = "FLOP" | "TURN" | "RIVER";
export type PotOddsBucket = "EXCELLENT" | "GOOD" | "NEUTRAL" | "BAD";
export type DrawBucket = "NONE" | "FLUSH_DRAW" | "OPEN_ENDED" | "COMBO_DRAW";
export type InitiativeBucket = "HAS_INITIATIVE" | "NO_INITIATIVE";
export type InitiativeStreetCountBucket = "FIRST_BARREL" | "SECOND_BARREL" | "THIRD_BARREL";
export type SprBucket = "LOW" | "MID" | "HIGH";
export type BoardPairedBucket = "TRUE" | "FALSE";
export type BoardWetnessBucket = "DRY" | "SEMI_WET" | "WET";
export type BoardMonotoneBucket = "TRUE" | "FALSE";
export type StraightConnectivityBucket = "LOW" | "MEDIUM" | "HIGH";
export type HasOverpairBucket = "TRUE" | "FALSE";
export type TopPairKickerStrengthBucket = "WEAK" | "MEDIUM" | "STRONG";
export type MadeHandStrengthBucket = "WEAK" | "MEDIUM" | "STRONG" | "NUTTY";
export type BlockerStrengthBucket = "NONE" | "SINGLE_BLOCKER" | "DOUBLE_BLOCKER";
export type OpponentTightnessBucket = "NIT" | "BALANCED" | "LOOSE";
export type OpponentAggressionBucket = "PASSIVE" | "AGGRESSIVE";
export type RecentAggressionHistoryBucket = "NONE" | "ONE_BARREL" | "TWO_BARRELS";
export type TableImageBucket = "TIGHT" | "BALANCED" | "LOOSE";
export type BetSizeRelativeToStackBucket = "SMALL" | "COMMITTING" | "ALL_IN";
export type CallCostRelativeToStackBucket = "TRIVIAL" | "MODERATE" | "COMMITTING";
export type TournamentIcmPressureBucket = "LOW" | "MEDIUM" | "HIGH";
export type MultiwayEquityPenaltyBucket = "NONE" | "MODERATE" | "HIGH";
export type RiskToleranceBucket = "LOW" | "NORMAL" | "HIGH";
export type TiltLevelBucket = "CALM" | "AGITATED" | "TILTED";
export type TimePressureBucket = "LOW" | "HIGH";
export type OpenOpportunityBucket = "FIRST_TO_ACT" | "ISOLATE" | "SQUEEZE";
export type SqueezeOpportunityBucket = "TRUE" | "FALSE";
export type LimpPresentBucket = "TRUE" | "FALSE";

export type HandTier = "PREMIUM" | "STRONG" | "GOOD" | "SPEC" | "TRASH";
export type HandTierByComboIndex = readonly HandTier[];
export type ComboWeights169 = readonly number[];

export type SizingRecipe =
  | "OPEN_SMALL"
  | "OPEN_STD"
  | "OPEN_LARGE"
  | "THREEBET_SMALL"
  | "THREEBET_STD"
  | "THREEBET_LARGE"
  | "CBET_SMALL"
  | "CBET_STD"
  | "CBET_LARGE"
  | "JAM";

export type ActionWeights = {
  FOLD?: number;
  CHECK?: number;
  CALL?: number;
  BET?: number;
  RAISE?: number;
  ALL_IN?: number;
};

export type SizingWeights = Partial<Record<SizingRecipe, number>>;

export type PreflopNodeAuthoring = {
  id: string;
  comboWeights169?: ComboWeights169;
  comboTierWeights?: Partial<Record<HandTier, number>>;
  actionWeights: ActionWeights;
  sizingWeights?: SizingWeights;
  notes?: string;
};

export type PreflopNodeCompiled = {
  id: string;
  comboWeights169: ComboWeights169;
  comboWeightSource: "TIER" | "RAW_169";
  actionWeights: ActionWeights;
  sizingWeights?: SizingWeights;
  notes?: string;
};

export type PreflopWeightsTableAuthoring = Record<
  PositionBucket,
  {
    UNOPENED: PreflopNodeAuthoring;
    VS_RAISE: Record<Exclude<BetSizeBucket, "NONE">, PreflopNodeAuthoring>;
    VS_3BET_PLUS: Record<Exclude<BetSizeBucket, "NONE">, PreflopNodeAuthoring>;
    VS_ALLIN: Record<Exclude<BetSizeBucket, "NONE">, PreflopNodeAuthoring>;
  }
>;

export type PreflopWeightsTableCompiled = Record<
  PositionBucket,
  {
    UNOPENED: PreflopNodeCompiled;
    VS_RAISE: Record<Exclude<BetSizeBucket, "NONE">, PreflopNodeCompiled>;
    VS_3BET_PLUS: Record<Exclude<BetSizeBucket, "NONE">, PreflopNodeCompiled>;
    VS_ALLIN: Record<Exclude<BetSizeBucket, "NONE">, PreflopNodeCompiled>;
  }
>;

export type PostflopHandClass = "AIR" | "WEAK_MADE" | "STRONG_MADE";
export type DrawFlagName = "hasFlushDraw" | "hasOpenEnded";
export type DrawFlags = Record<DrawFlagName, boolean>;
export type AxisFeatureKey =
  | "playerCountBucket"
  | "potOddsBucket"
  | "drawBucket"
  | "positionPostflopBucket"
  | "stackBucket"
  | "facingPressureBucket"
  | "initiativeBucket"
  | "streetBucket"
  | "initiativeStreetCountBucket"
  | "sprBucket"
  | "boardPairedBucket"
  | "boardWetnessBucket"
  | "boardMonotoneBucket"
  | "straightConnectivityBucket"
  | "hasOverpairBucket"
  | "topPairKickerStrengthBucket"
  | "madeHandStrengthBucket"
  | "blockerStrengthBucket"
  | "opponentTightnessBucket"
  | "opponentAggressionBucket"
  | "recentAggressionHistoryBucket"
  | "tableImageBucket"
  | "betSizeRelativeToStackBucket"
  | "callCostRelativeToStackBucket"
  | "tournamentIcmPressureBucket"
  | "multiwayEquityPenaltyBucket"
  | "riskToleranceBucket"
  | "tiltLevelBucket"
  | "timePressureBucket"
  | "openOpportunityBucket"
  | "squeezeOpportunityBucket"
  | "limpPresentBucket";
export type AxisTier = "ACTIVE" | "NEUTRAL" | "FUTURE";
export type AxisDefinitionAuthoring = {
  id: string;
  order: number;
  feature: AxisFeatureKey;
  strength?: number;
  buckets: Record<string, ActionWeights>;
};
export type AxisDefinitionCompiled = Omit<AxisDefinitionAuthoring, "strength"> & {
  strength: number;
};
export type AxisMeta = {
  id: string;
  tier: AxisTier;
  rationale?: string;
};

export type PostflopNodeAuthoring = {
  id: string;
  actionWeights: ActionWeights;
  sizingWeights?: SizingWeights;
  notes?: string;
};

export type PostflopNodeCompiled = {
  id: string;
  actionWeights: ActionWeights;
  sizingWeights?: SizingWeights;
  notes?: string;
};

export type PostflopWeightsTableAuthoring = Record<
  Street,
  Record<
    PressureBucket,
    Record<PostflopHandClass, PostflopNodeAuthoring>
  >
>;

export type PostflopWeightsTableCompiled = Record<
  Street,
  Record<
    PressureBucket,
    Record<PostflopHandClass, PostflopNodeCompiled>
  >
>;

export type TightAggressiveConfigV1 = {
  version: 1;
  metadata: {
    id: "tight_aggressive_v1";
    label: string;
    description?: string;
  };
  normalization: {
    maxWeight: number;
    zeroIsFoldGate: boolean;
  };
  preflop: {
    comboIndexMap: "STANDARD_169_V1";
    handTierByComboIndex: HandTierByComboIndex;
    table: PreflopWeightsTableAuthoring;
  };
  postflop: {
    evaluator: "BEST5_V1";
    table: PostflopWeightsTableAuthoring;
  };
  axes?: AxisDefinitionAuthoring[];
  axisMeta?: AxisMeta[];
  sizing: {
    recipes: "CASH_STANDARD_V1";
  };
  safety: {
    fallbackActionOrder: readonly ["CHECK", "FOLD", "CALL", "ALL_IN"];
  };
  debug?: {
    emitDecisionTrace: boolean;
  };
};

export type TightAggressiveCompiledConfig = {
  version: 1;
  metadata: TightAggressiveConfigV1["metadata"];
  normalization: TightAggressiveConfigV1["normalization"];
  preflop: {
    comboIndexMap: TightAggressiveConfigV1["preflop"]["comboIndexMap"];
    handTierByComboIndex: HandTierByComboIndex;
    table: PreflopWeightsTableCompiled;
  };
  postflop: {
    evaluator: TightAggressiveConfigV1["postflop"]["evaluator"];
    table: PostflopWeightsTableCompiled;
  };
  axes: AxisDefinitionCompiled[];
  axisMeta: AxisMeta[];
  sizing: TightAggressiveConfigV1["sizing"];
  safety: TightAggressiveConfigV1["safety"];
  debug?: TightAggressiveConfigV1["debug"];
};

export type DerivedFeatures = {
  street: "PREFLOP" | Street;
  streetBucket?: Street;
  positionBucket: PositionBucket;
  positionPostflopBucket?: PositionPostflopBucket;
  pressureBucket: PressureBucket;
  facingPressureBucket: PressureBucket;
  betSizeBucket: BetSizeBucket;
  stackBucket: StackBucket;
  activePlayersInHand: number;
  playerCountBucket: PlayerCountBucket;
  initiativeBucket: InitiativeBucket;
  initiativeStreetCountBucket?: InitiativeStreetCountBucket;
  sprBucket: SprBucket;
  comboIndex?: number;
  handTier?: HandTier;
  handClass?: PostflopHandClass;
  drawFlags?: DrawFlags;
  drawBucket?: DrawBucket;
  potOddsBucket?: PotOddsBucket;
  boardPairedBucket?: BoardPairedBucket;
  boardWetnessBucket?: BoardWetnessBucket;
  boardMonotoneBucket?: BoardMonotoneBucket;
  straightConnectivityBucket?: StraightConnectivityBucket;
  hasOverpairBucket?: HasOverpairBucket;
  topPairKickerStrengthBucket?: TopPairKickerStrengthBucket;
  madeHandStrengthBucket?: MadeHandStrengthBucket;
  blockerStrengthBucket?: BlockerStrengthBucket;
  opponentTightnessBucket: OpponentTightnessBucket;
  opponentAggressionBucket: OpponentAggressionBucket;
  recentAggressionHistoryBucket: RecentAggressionHistoryBucket;
  tableImageBucket: TableImageBucket;
  betSizeRelativeToStackBucket?: BetSizeRelativeToStackBucket;
  callCostRelativeToStackBucket?: CallCostRelativeToStackBucket;
  tournamentIcmPressureBucket: TournamentIcmPressureBucket;
  multiwayEquityPenaltyBucket: MultiwayEquityPenaltyBucket;
  riskToleranceBucket: RiskToleranceBucket;
  tiltLevelBucket: TiltLevelBucket;
  timePressureBucket: TimePressureBucket;
  openOpportunityBucket?: OpenOpportunityBucket;
  squeezeOpportunityBucket?: SqueezeOpportunityBucket;
  limpPresentBucket?: LimpPresentBucket;
  potCents: number;
  toCallCents: number;
};
