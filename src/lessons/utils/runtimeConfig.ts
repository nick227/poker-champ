import { asObject } from "./objectHelpers.js";

export function getRuntimeConfigFromGradingSpec(gradingSpecJson: unknown): {
  scenarioProviderKey: string | null;
  evaluatorKey: string | null;
  revealLayerKeys: string[] | null;
  continuationKey: string | null;
  runtimeConfigJson: Record<string, unknown> | null;
  displayCategory: string | null;
} {
  const gradingSpec = asObject(gradingSpecJson);
  const runtime = asObject(gradingSpec?.runtime);
  const revealLayerKeysRaw = Array.isArray(runtime?.revealLayerKeys)
    ? runtime.revealLayerKeys
    : null;
  const revealLayerKeys = revealLayerKeysRaw
    ? revealLayerKeysRaw.filter((v): v is string => typeof v === "string")
    : null;
  return {
    scenarioProviderKey: typeof runtime?.scenarioProviderKey === "string" ? runtime.scenarioProviderKey : null,
    evaluatorKey: typeof runtime?.evaluatorKey === "string" ? runtime.evaluatorKey : null,
    revealLayerKeys,
    continuationKey: typeof runtime?.continuationKey === "string" ? runtime.continuationKey : null,
    runtimeConfigJson: asObject(runtime?.runtimeConfigJson),
    displayCategory: typeof runtime?.displayCategory === "string" ? runtime.displayCategory : null,
  };
}
