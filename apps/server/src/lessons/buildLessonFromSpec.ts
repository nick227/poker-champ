/**
 * Build lesson artifacts from a minimal hand spec: validate, project, check constraints, return points + metadata.
 */

import type { MinimalHandSpec } from "./minimalHandSpec.types.js";
import { STREET_ORDER } from "./minimalHandSpec.types.js";
import { validateMinimalSpecOrThrow } from "./validateMinimalSpec.js";
import { projectSpecToSnapshots, type HeroDecisionPoint } from "./projectSpecToSnapshots.js";

export type BuildLessonFromSpecResult =
  | { ok: true; points: HeroDecisionPoint[]; spec: MinimalHandSpec; totalActionCount: number }
  | { ok: false; error: string };

export function buildLessonFromSpec(specUnknown: unknown): BuildLessonFromSpecResult {
  try {
    validateMinimalSpecOrThrow(specUnknown);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const spec = specUnknown as MinimalHandSpec;
  const proj = projectSpecToSnapshots(spec);
  if (!proj.ok) return { ok: false, error: proj.error };

  const { points, maxStreetReached, villainBarrelCount, totalActionCount } = proj;
  const constraints = spec.constraints;
  if (constraints) {
    if (constraints.minStreetReached) {
      const required = constraints.minStreetReached;
      if (STREET_ORDER.indexOf(maxStreetReached) < STREET_ORDER.indexOf(required)) {
        return { ok: false, error: `Constraint minStreetReached ${required} not met; hand reached ${maxStreetReached}` };
      }
    }
    if (constraints.minHeroDecisions != null && points.length < constraints.minHeroDecisions) {
      return { ok: false, error: `Constraint minHeroDecisions ${constraints.minHeroDecisions} not met; got ${points.length}` };
    }
    if (constraints.villainBarrels != null && villainBarrelCount < constraints.villainBarrels) {
      return { ok: false, error: `Constraint villainBarrels ${constraints.villainBarrels} not met; villain bet on ${villainBarrelCount} streets` };
    }
  }

  return { ok: true, points, spec, totalActionCount };
}
