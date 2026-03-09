import type { ActionPayload } from "../../../../../messages/schemas.js";
import type { AxisDefinitionCompiled, DerivedFeatures } from "../types.js";

type WeightMap = Partial<Record<ActionPayload["action"], number>>;
type AxisContribution = {
  action: ActionPayload["action"];
  bucketMultiplier: number;
  strength: number;
  finalMultiplier: number;
};
export type AxisTraceEntry = {
  axisId: string;
  bucket: string;
  contributions: AxisContribution[];
};
export type ApplyAxesResult = {
  weights: WeightMap;
  axesApplied: AxisTraceEntry[];
};

export function applyAxes(base: WeightMap, axes: AxisDefinitionCompiled[], features: DerivedFeatures): ApplyAxesResult {
  let weights: WeightMap = { ...base };
  const axesApplied: AxisTraceEntry[] = [];
  for (const axis of axes) {
    const bucket = deriveAxisBucket(axis.feature, features);
    if (!bucket) continue;
    const modifiers = axis.buckets[bucket];
    const contributions = deriveContributions(modifiers, axis.strength);
    axesApplied.push({
      axisId: axis.id,
      bucket,
      contributions,
    });
    if (modifiers) {
      weights = applyAxisModifiers(weights, modifiers, axis.strength);
    }
  }
  return { weights, axesApplied };
}

function deriveAxisBucket(feature: AxisDefinitionCompiled["feature"], features: DerivedFeatures): string | undefined {
  const value = (features as unknown as Record<string, string | undefined>)[feature];
  return value;
}

function deriveContributions(modifiers: WeightMap | undefined, strength: number): AxisContribution[] {
  if (!modifiers) return [];
  const out: AxisContribution[] = [];
  for (const [action, multiplier] of Object.entries(modifiers) as [ActionPayload["action"], number | undefined][]) {
    if (multiplier == null) continue;
    out.push({
      action,
      bucketMultiplier: multiplier,
      strength,
      finalMultiplier: applyStrength(multiplier, strength),
    });
  }
  return out;
}

function applyAxisModifiers(base: WeightMap, modifiers: WeightMap, strength: number): WeightMap {
  const out: WeightMap = { ...base };
  for (const [action, currentWeight] of Object.entries(base) as [keyof WeightMap, number | undefined][]) {
    if (currentWeight == null || currentWeight <= 0) continue;
    const bucketMultiplier = modifiers[action];
    if (bucketMultiplier == null) continue;
    const finalMultiplier = applyStrength(bucketMultiplier, strength);
    const next = currentWeight * finalMultiplier;
    out[action] = next > 0 ? next : 0;
  }
  return out;
}

function applyStrength(bucketMultiplier: number, strength: number): number {
  if (strength === 0) return 1;
  if (bucketMultiplier === 0) return 0;
  return bucketMultiplier ** strength;
}
