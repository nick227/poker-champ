import type { TableAnimationDefinition, TableAnimationEvent } from "./animationTypes";

function def(
  event: TableAnimationEvent,
  tier: number,
  durationMs: number,
  layers: TableAnimationDefinition["layers"]
): TableAnimationDefinition {
  return { event, tier, anchor: "TABLE_CENTER", durationMs, layers };
}

export const TABLE_ANIMATIONS: TableAnimationDefinition[] = [
  def("POT_WIN", 0, 1200, [
    { type: "RING", durationMs: 400 },
    { type: "TEXT", textRole: "headline", textSize: "small", durationMs: 800, delayMs: 100 },
    { type: "TEXT", textRole: "amount", durationMs: 600, delayMs: 200 },
  ]),
  def("POT_WIN", 1, 1400, [
    { type: "FLASH", durationMs: 300 },
    { type: "RING", durationMs: 500 },
    { type: "TEXT", textRole: "headline", textSize: "medium", durationMs: 900, delayMs: 80 },
    { type: "TEXT", textRole: "amount", durationMs: 700, delayMs: 150 },
  ]),
  def("POT_WIN", 2, 1600, [
    { type: "BURST", durationMs: 400, rays: 8 },
    { type: "FLASH", durationMs: 350 },
    { type: "RING", durationMs: 600 },
    { type: "TEXT", textRole: "headline", textSize: "large", durationMs: 1000, delayMs: 50 },
    { type: "TEXT", textRole: "amount", durationMs: 800, delayMs: 100 },
  ]),
  def("POT_WIN", 3, 1800, [
    { type: "BURST", durationMs: 500, rays: 12 },
    { type: "PARTICLES", durationMs: 600, particleCount: 12, particleSpread: 50 },
    { type: "FLASH", durationMs: 400 },
    { type: "RING", durationMs: 700 },
    { type: "TEXT", textRole: "headline", textSize: "xlarge", durationMs: 1100 },
    { type: "TEXT", textRole: "amount", durationMs: 900, delayMs: 80 },
  ]),
  def("POT_WIN", 4, 2200, [
    { type: "BURST", durationMs: 600, rays: 16 },
    { type: "PARTICLES", durationMs: 800, particleCount: 16, particleSpread: 60 },
    { type: "FLASH", durationMs: 500 },
    { type: "RING", durationMs: 800 },
    { type: "TEXT", textRole: "headline", textSize: "xlarge", textGlow: true, durationMs: 1400, delayMs: 100 },
    { type: "TEXT", textRole: "amount", durationMs: 1000, delayMs: 150 },
  ]),
  def("ALL_IN", 0, 1000, [{ type: "TEXT", textRole: "headline", textSize: "medium", durationMs: 700 }]),
  def("ALL_IN", 1, 1200, [
    { type: "FLASH", durationMs: 250 },
    { type: "TEXT", textRole: "headline", textSize: "large", durationMs: 900, delayMs: 50 },
  ]),
  def("ALL_IN", 2, 1500, [
    { type: "BURST", durationMs: 400, rays: 6 },
    { type: "FLASH", durationMs: 300 },
    { type: "TEXT", textRole: "headline", textSize: "large", durationMs: 1000 },
  ]),
  def("ALL_IN", 3, 1800, [
    { type: "BURST", durationMs: 500, rays: 10 },
    { type: "PARTICLES", durationMs: 500, particleCount: 12, particleSpread: 50 },
    { type: "FLASH", durationMs: 350 },
    { type: "TEXT", textRole: "headline", textSize: "xlarge", textGlow: true, durationMs: 1200, delayMs: 80 },
  ]),
  def("ALL_IN", 4, 2200, [
    { type: "BURST", durationMs: 600, rays: 16 },
    { type: "PARTICLES", durationMs: 700, particleCount: 16, particleSpread: 60 },
    { type: "FLASH", durationMs: 450 },
    { type: "TEXT", textRole: "headline", textSize: "xlarge", textGlow: true, durationMs: 1500, delayMs: 100 },
    { type: "TEXT", textRole: "amount", durationMs: 800, delayMs: 200 },
  ]),
  def("SHOWDOWN", 0, 1000, [{ type: "TEXT", textRole: "headline", textSize: "medium", durationMs: 800 }]),
  def("SHOWDOWN", 1, 1200, [
    { type: "FLASH", durationMs: 300 },
    { type: "TEXT", textRole: "headline", textSize: "large", durationMs: 900 },
  ]),
  def("SHOWDOWN", 2, 1500, [
    { type: "BURST", durationMs: 400, rays: 8 },
    { type: "FLASH", durationMs: 350 },
    { type: "TEXT", textRole: "headline", textSize: "large", durationMs: 1000 },
  ]),
  def("SHOWDOWN", 3, 1800, [
    { type: "BURST", durationMs: 500, rays: 12 },
    { type: "PARTICLES", durationMs: 600, particleCount: 12, particleSpread: 50 },
    { type: "FLASH", durationMs: 400 },
    { type: "TEXT", textRole: "headline", textSize: "xlarge", textGlow: true, durationMs: 1200 },
  ]),
  def("SHOWDOWN", 4, 2200, [
    { type: "BURST", durationMs: 600, rays: 16 },
    { type: "PARTICLES", durationMs: 800, particleCount: 16, particleSpread: 60 },
    { type: "FLASH", durationMs: 500 },
    { type: "TEXT", textRole: "headline", textSize: "xlarge", textGlow: true, durationMs: 1400 },
  ]),
];

const BY_KEY = new Map<string, TableAnimationDefinition>();
for (const d of TABLE_ANIMATIONS) {
  BY_KEY.set(`${d.event}:${d.tier}`, d);
}

export function resolveAnimation(
  event: TableAnimationEvent,
  tier: number
): TableAnimationDefinition | undefined {
  const clamped = Math.max(0, Math.min(4, Math.floor(tier))) as 0 | 1 | 2 | 3 | 4;
  return BY_KEY.get(`${event}:${clamped}`) ?? BY_KEY.get(`${event}:0`);
}
