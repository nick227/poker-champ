import type {
  ActionWeights,
  AxisDefinitionAuthoring,
  AxisDefinitionCompiled,
  AxisMeta,
  AxisTier,
  BetSizeBucket,
  ComboWeights169,
  HandTier,
  HandTierByComboIndex,
  PositionBucket,
  PostflopHandClass,
  PostflopNodeAuthoring,
  PostflopNodeCompiled,
  PostflopWeightsTableAuthoring,
  PostflopWeightsTableCompiled,
  PreflopNodeAuthoring,
  PreflopNodeCompiled,
  PreflopWeightsTableAuthoring,
  PreflopWeightsTableCompiled,
  PressureBucket,
  TightAggressiveCompiledConfig,
  TightAggressiveConfigV1,
} from "../types.js";

const PRE_FLOP_COMBO_COUNT = 169;

const POSITION_BUCKETS: readonly PositionBucket[] = ["EARLY", "MIDDLE", "LATE", "BLINDS"];
const PRESSURE_BUCKETS: readonly PressureBucket[] = ["UNOPENED", "VS_RAISE", "VS_3BET_PLUS", "VS_ALLIN"];
const FACING_BET_SIZE_BUCKETS: readonly Exclude<BetSizeBucket, "NONE">[] = ["SMALL", "MEDIUM", "LARGE", "MAX"];
const POSTFLOP_STREETS = ["FLOP", "TURN", "RIVER"] as const;
const POSTFLOP_HAND_CLASSES: readonly PostflopHandClass[] = ["AIR", "WEAK_MADE", "STRONG_MADE"];
const HAND_TIERS: readonly HandTier[] = ["PREMIUM", "STRONG", "GOOD", "SPEC", "TRASH"];
const AXIS_FEATURES = [
  "playerCountBucket",
  "potOddsBucket",
  "drawBucket",
  "positionPostflopBucket",
  "stackBucket",
  "facingPressureBucket",
  "initiativeBucket",
  "streetBucket",
  "initiativeStreetCountBucket",
  "sprBucket",
  "boardPairedBucket",
  "boardWetnessBucket",
  "boardMonotoneBucket",
  "straightConnectivityBucket",
  "hasOverpairBucket",
  "topPairKickerStrengthBucket",
  "madeHandStrengthBucket",
  "blockerStrengthBucket",
  "opponentTightnessBucket",
  "opponentAggressionBucket",
  "recentAggressionHistoryBucket",
  "tableImageBucket",
  "betSizeRelativeToStackBucket",
  "callCostRelativeToStackBucket",
  "tournamentIcmPressureBucket",
  "multiwayEquityPenaltyBucket",
  "riskToleranceBucket",
  "tiltLevelBucket",
  "timePressureBucket",
  "openOpportunityBucket",
  "squeezeOpportunityBucket",
  "limpPresentBucket",
] as const;

export function loadTightAggressiveConfig(config: unknown): TightAggressiveCompiledConfig {
  const c = validateTopLevel(config);
  const nodeIds = new Set<string>();

  validateHandTierMap(c.preflop.handTierByComboIndex);
  const compiledPreflop = compilePreflopTable(c.preflop.table, c.preflop.handTierByComboIndex, nodeIds);
  const compiledPostflop = compilePostflopTable(c.postflop.table, nodeIds);
  const compiledAxes = compileAxes(c.axes ?? []);
  const compiledAxisMeta = compileAxisMeta(c.axisMeta ?? [], compiledAxes);

  const compiled: TightAggressiveCompiledConfig = {
    version: 1,
    metadata: { ...c.metadata },
    normalization: { ...c.normalization },
    preflop: {
      comboIndexMap: c.preflop.comboIndexMap,
      handTierByComboIndex: [...c.preflop.handTierByComboIndex] as HandTierByComboIndex,
      table: compiledPreflop,
    },
    postflop: {
      evaluator: c.postflop.evaluator,
      table: compiledPostflop,
    },
    axes: compiledAxes,
    axisMeta: compiledAxisMeta,
    sizing: { ...c.sizing },
    safety: { ...c.safety },
    debug: c.debug ? { ...c.debug } : undefined,
  };

  return deepFreeze(compiled);
}

function validateTopLevel(config: unknown): TightAggressiveConfigV1 {
  if (!config || typeof config !== "object") {
    throw new Error("TIGHT_AGGRESSIVE_CONFIG_INVALID: expected object");
  }
  const c = config as TightAggressiveConfigV1;
  if (c.version !== 1) {
    throw new Error(`TIGHT_AGGRESSIVE_CONFIG_INVALID_VERSION: expected 1, received ${String((c as any).version)}`);
  }
  if (!c.metadata?.id || !c.metadata?.label) {
    throw new Error("TIGHT_AGGRESSIVE_CONFIG_INVALID_METADATA");
  }
  if (!c.preflop?.table || !c.postflop?.table) {
    throw new Error("TIGHT_AGGRESSIVE_CONFIG_INVALID_TABLES");
  }
  return c;
}

function compilePreflopTable(
  table: PreflopWeightsTableAuthoring,
  handTierByComboIndex: HandTierByComboIndex,
  nodeIds: Set<string>,
): PreflopWeightsTableCompiled {
  const compiled = {} as PreflopWeightsTableCompiled;
  for (const pos of POSITION_BUCKETS) {
    const posEntry = table[pos];
    if (!posEntry) throw new Error(`TIGHT_AGGRESSIVE_CONFIG_MISSING_POSITION: ${pos}`);

    compiled[pos] = {
      UNOPENED: compilePreflopNode(posEntry.UNOPENED, handTierByComboIndex, nodeIds, `${pos}.UNOPENED`),
      VS_RAISE: compileFacingMap(posEntry.VS_RAISE, handTierByComboIndex, nodeIds, `${pos}.VS_RAISE`),
      VS_3BET_PLUS: compileFacingMap(posEntry.VS_3BET_PLUS, handTierByComboIndex, nodeIds, `${pos}.VS_3BET_PLUS`),
      VS_ALLIN: compileFacingMap(posEntry.VS_ALLIN, handTierByComboIndex, nodeIds, `${pos}.VS_ALLIN`),
    };
  }
  return compiled;
}

function compileFacingMap(
  facingMap: Record<Exclude<BetSizeBucket, "NONE">, PreflopNodeAuthoring>,
  handTierByComboIndex: HandTierByComboIndex,
  nodeIds: Set<string>,
  path: string,
): Record<Exclude<BetSizeBucket, "NONE">, PreflopNodeCompiled> {
  const compiled = {} as Record<Exclude<BetSizeBucket, "NONE">, PreflopNodeCompiled>;
  for (const size of FACING_BET_SIZE_BUCKETS) {
    const node = facingMap[size];
    if (!node) throw new Error(`TIGHT_AGGRESSIVE_CONFIG_MISSING_BET_SIZE_NODE: ${path}.${size}`);
    compiled[size] = compilePreflopNode(node, handTierByComboIndex, nodeIds, `${path}.${size}`);
  }
  return compiled;
}

function compilePreflopNode(
  node: PreflopNodeAuthoring,
  handTierByComboIndex: HandTierByComboIndex,
  nodeIds: Set<string>,
  path: string,
): PreflopNodeCompiled {
  validateNodeId(node.id, nodeIds, path);
  validateNonNegativeWeightMap(node.actionWeights, `${path}.actionWeights`);
  if (node.sizingWeights) validateNonNegativeWeightMap(node.sizingWeights, `${path}.sizingWeights`);

  const hasRaw = Array.isArray(node.comboWeights169);
  const hasTier = !!node.comboTierWeights;
  if (!hasRaw && !hasTier) {
    throw new Error(`TIGHT_AGGRESSIVE_CONFIG_PRELFLOP_NODE_MISSING_COMBO_WEIGHTS: ${path}`);
  }

  let comboWeights169: ComboWeights169;
  let comboWeightSource: "TIER" | "RAW_169";
  if (hasRaw) {
    comboWeights169 = validateAndNormalizeComboWeights(node.comboWeights169 as number[], `${path}.comboWeights169`);
    comboWeightSource = "RAW_169";
  } else {
    comboWeights169 = compileTierWeightsTo169(node.comboTierWeights!, handTierByComboIndex, `${path}.comboTierWeights`);
    comboWeightSource = "TIER";
  }

  return {
    id: node.id,
    comboWeights169,
    comboWeightSource,
    actionWeights: normalizeWeightMap(node.actionWeights),
    sizingWeights: node.sizingWeights ? normalizeWeightMap(node.sizingWeights) : undefined,
    notes: node.notes,
  };
}

function compilePostflopTable(table: PostflopWeightsTableAuthoring, nodeIds: Set<string>): PostflopWeightsTableCompiled {
  const compiled = {} as PostflopWeightsTableCompiled;
  for (const street of POSTFLOP_STREETS) {
    const streetEntry = table[street];
    if (!streetEntry) throw new Error(`TIGHT_AGGRESSIVE_CONFIG_MISSING_POSTFLOP_STREET: ${street}`);
    compiled[street] = {} as PostflopWeightsTableCompiled[typeof street];

    for (const pressure of PRESSURE_BUCKETS) {
      const pressureEntry = streetEntry[pressure];
      if (!pressureEntry) throw new Error(`TIGHT_AGGRESSIVE_CONFIG_MISSING_POSTFLOP_PRESSURE: ${street}.${pressure}`);
      compiled[street][pressure] = {} as PostflopWeightsTableCompiled[typeof street][typeof pressure];
      for (const handClass of POSTFLOP_HAND_CLASSES) {
        const node = pressureEntry[handClass];
        if (!node) {
          throw new Error(`TIGHT_AGGRESSIVE_CONFIG_MISSING_POSTFLOP_NODE: ${street}.${pressure}.${handClass}`);
        }
        compiled[street][pressure][handClass] = compilePostflopNode(
          node,
          nodeIds,
          `${street}.${pressure}.${handClass}`,
        );
      }
    }
  }
  return compiled;
}

function compilePostflopNode(node: PostflopNodeAuthoring, nodeIds: Set<string>, path: string): PostflopNodeCompiled {
  validateNodeId(node.id, nodeIds, path);
  validateNonNegativeWeightMap(node.actionWeights, `${path}.actionWeights`);
  if (node.sizingWeights) validateNonNegativeWeightMap(node.sizingWeights, `${path}.sizingWeights`);

  return {
    id: node.id,
    actionWeights: normalizeWeightMap(node.actionWeights),
    sizingWeights: node.sizingWeights ? normalizeWeightMap(node.sizingWeights) : undefined,
    notes: node.notes,
  };
}

function compileAxes(axes: AxisDefinitionAuthoring[]): AxisDefinitionCompiled[] {
  const seen = new Set<string>();
  const compiled = axes.map((axis, idx) => {
    if (!axis.id || typeof axis.id !== "string") {
      throw new Error(`TIGHT_AGGRESSIVE_CONFIG_INVALID_AXIS_ID: index ${idx}`);
    }
    if (seen.has(axis.id)) {
      throw new Error(`TIGHT_AGGRESSIVE_CONFIG_DUPLICATE_AXIS_ID: ${axis.id}`);
    }
    seen.add(axis.id);
    if (!Number.isFinite(axis.order)) {
      throw new Error(`TIGHT_AGGRESSIVE_CONFIG_INVALID_AXIS_ORDER: ${axis.id}`);
    }
    const strength = axis.strength ?? 1;
    if (!Number.isFinite(strength) || strength < 0) {
      throw new Error(`TIGHT_AGGRESSIVE_CONFIG_INVALID_AXIS_STRENGTH: ${axis.id}`);
    }
    if (!AXIS_FEATURES.includes(axis.feature)) {
      throw new Error(`TIGHT_AGGRESSIVE_CONFIG_INVALID_AXIS_FEATURE: ${axis.id}`);
    }

    const buckets: AxisDefinitionCompiled["buckets"] = {};
    for (const [bucket, mods] of Object.entries(axis.buckets ?? {})) {
      validateNonNegativeWeightMap(mods, `axes.${axis.id}.buckets.${bucket}`);
      buckets[bucket] = normalizeWeightMap(mods);
    }

    return {
      id: axis.id,
      order: axis.order,
      feature: axis.feature,
      strength,
      buckets,
    };
  });

  compiled.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  return compiled;
}

function compileAxisMeta(axisMeta: AxisMeta[], axes: AxisDefinitionCompiled[]): AxisMeta[] {
  const byAxisId = new Map(axes.map((axis) => [axis.id, axis]));
  const byMetaId = new Map<string, AxisMeta>();
  for (const meta of axisMeta) {
    if (!meta.id || !byAxisId.has(meta.id)) {
      throw new Error(`TIGHT_AGGRESSIVE_CONFIG_INVALID_AXIS_META_ID: ${meta.id}`);
    }
    if (byMetaId.has(meta.id)) {
      throw new Error(`TIGHT_AGGRESSIVE_CONFIG_DUPLICATE_AXIS_META_ID: ${meta.id}`);
    }
    if (!isAxisTier(meta.tier)) {
      throw new Error(`TIGHT_AGGRESSIVE_CONFIG_INVALID_AXIS_META_TIER: ${meta.id}`);
    }
    byMetaId.set(meta.id, { ...meta });
  }

  for (const axis of axes) {
    const meta = byMetaId.get(axis.id);
    if (!meta) {
      throw new Error(`TIGHT_AGGRESSIVE_CONFIG_MISSING_AXIS_META: ${axis.id}`);
    }
    validateTierInvariant(axis, meta.tier);
  }

  return [...byMetaId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function validateTierInvariant(axis: AxisDefinitionCompiled, tier: AxisTier): void {
  const hasNonNeutral = axisHasNonNeutralMultiplier(axis.buckets);
  if (tier === "ACTIVE" && !hasNonNeutral) {
    throw new Error(`TIGHT_AGGRESSIVE_CONFIG_AXIS_TIER_VIOLATION_ACTIVE: ${axis.id}`);
  }
  if ((tier === "NEUTRAL" || tier === "FUTURE") && hasNonNeutral) {
    throw new Error(`TIGHT_AGGRESSIVE_CONFIG_AXIS_TIER_VIOLATION_${tier}: ${axis.id}`);
  }
}

function axisHasNonNeutralMultiplier(buckets: Record<string, ActionWeights>): boolean {
  for (const modifiers of Object.values(buckets)) {
    for (const value of Object.values(modifiers)) {
      if (value == null) continue;
      if (value !== 1) return true;
    }
  }
  return false;
}

function isAxisTier(value: unknown): value is AxisTier {
  return value === "ACTIVE" || value === "NEUTRAL" || value === "FUTURE";
}

function validateHandTierMap(map: HandTierByComboIndex): void {
  if (!Array.isArray(map) || map.length !== PRE_FLOP_COMBO_COUNT) {
    throw new Error(`TIGHT_AGGRESSIVE_CONFIG_INVALID_HAND_TIER_MAP_LENGTH: expected ${PRE_FLOP_COMBO_COUNT}`);
  }
  map.forEach((tier, idx) => {
    if (!HAND_TIERS.includes(tier)) {
      throw new Error(`TIGHT_AGGRESSIVE_CONFIG_INVALID_HAND_TIER_AT_INDEX: ${idx}`);
    }
  });
}

function validateNodeId(id: string, nodeIds: Set<string>, path: string): void {
  if (!id || typeof id !== "string") {
    throw new Error(`TIGHT_AGGRESSIVE_CONFIG_INVALID_NODE_ID: ${path}`);
  }
  if (nodeIds.has(id)) {
    throw new Error(`TIGHT_AGGRESSIVE_CONFIG_DUPLICATE_NODE_ID: ${id}`);
  }
  nodeIds.add(id);
}

function compileTierWeightsTo169(
  comboTierWeights: Partial<Record<HandTier, number>>,
  handTierByComboIndex: HandTierByComboIndex,
  path: string,
): ComboWeights169 {
  validateNonNegativeWeightMap(comboTierWeights, path);
  const compiled = handTierByComboIndex.map((tier) => comboTierWeights[tier] ?? 0);
  return validateAndNormalizeComboWeights(compiled, `${path}.compiled`);
}

function validateAndNormalizeComboWeights(weights: number[], path: string): ComboWeights169 {
  if (!Array.isArray(weights) || weights.length !== PRE_FLOP_COMBO_COUNT) {
    throw new Error(`TIGHT_AGGRESSIVE_CONFIG_INVALID_COMBO_WEIGHT_LENGTH: ${path}`);
  }
  weights.forEach((weight, idx) => {
    if (!isFiniteNonNegativeNumber(weight)) {
      throw new Error(`TIGHT_AGGRESSIVE_CONFIG_INVALID_COMBO_WEIGHT_VALUE: ${path}[${idx}]`);
    }
  });
  return [...weights] as ComboWeights169;
}

function validateNonNegativeWeightMap(input: Record<string, number | undefined>, path: string): void {
  Object.entries(input).forEach(([key, value]) => {
    if (value == null) return;
    if (!isFiniteNonNegativeNumber(value)) {
      throw new Error(`TIGHT_AGGRESSIVE_CONFIG_INVALID_WEIGHT: ${path}.${key}`);
    }
  });
}

function normalizeWeightMap<T extends Record<string, number | undefined>>(input: T): T {
  return { ...input };
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function deepFreeze<T>(input: T): T {
  if (input === null || typeof input !== "object" || Object.isFrozen(input)) {
    return input;
  }
  Object.freeze(input);
  for (const value of Object.values(input as Record<string, unknown>)) {
    deepFreeze(value);
  }
  return input;
}
