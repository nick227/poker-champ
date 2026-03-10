import type { TableAnimationDefinition, TableAnimationEffectId } from "./tableAnimation.types";

const POT_SIZE_TIERS_CENTS = [500, 2000, 10000, 50000] as const;
const HAND_STRENGTH_BOOST: Record<string, number> = {
  "high card": 0,
  "pair": 1,
  "two pair": 1,
  "three of a kind": 2,
  straight: 2,
  flush: 3,
  "full house": 3,
  "four of a kind": 4,
  "straight flush": 4,
  "royal flush": 4,
};

function tierFromPotAndHand(potCents: number, winningHandDescr?: string): number {
  let tier = 0;
  for (let i = 0; i < POT_SIZE_TIERS_CENTS.length; i++) {
    if (potCents >= POT_SIZE_TIERS_CENTS[i]) tier = i + 1;
  }
  const lower = (winningHandDescr ?? "").toLowerCase();
  const boost = Object.entries(HAND_STRENGTH_BOOST).reduce(
    (acc, [key, val]) => (lower.includes(key) ? Math.max(acc, val) : acc),
    0
  );
  return Math.min(4, tier + boost);
}

export function getTierForPotWin(potCents: number, winningHandDescr?: string): number {
  return tierFromPotAndHand(potCents, winningHandDescr);
}

export function getTierForAllIn(potCents: number, amountCents: number): number {
  const potTier = tierFromPotAndHand(potCents);
  const bigBet = amountCents >= 5000 ? 1 : 0;
  return Math.min(4, potTier + bigBet);
}

function def(
  id: TableAnimationEffectId,
  tier: number,
  totalDurationMs: number,
  layers: TableAnimationDefinition["layers"]
): TableAnimationDefinition {
  return { id, tier, totalDurationMs, layers };
}

const REGISTRY: TableAnimationDefinition[] = [
  def("potWin", 0, 1200, [
    { type: "ring", zIndex: 1, durationMs: 400 },
    { type: "typography", zIndex: 2, durationMs: 800, delayMs: 100, params: { size: "small" } },
    { type: "amount", zIndex: 3, durationMs: 600, delayMs: 200 },
  ]),
  def("potWin", 1, 1400, [
    { type: "flash", zIndex: 0, durationMs: 300 },
    { type: "ring", zIndex: 1, durationMs: 500 },
    { type: "typography", zIndex: 2, durationMs: 900, delayMs: 80, params: { size: "medium" } },
    { type: "amount", zIndex: 3, durationMs: 700, delayMs: 150 },
  ]),
  def("potWin", 2, 1600, [
    { type: "burst", zIndex: 0, durationMs: 400, params: { rays: 8 } },
    { type: "flash", zIndex: 1, durationMs: 350 },
    { type: "ring", zIndex: 2, durationMs: 600 },
    { type: "typography", zIndex: 3, durationMs: 1000, delayMs: 50, params: { size: "large" } },
    { type: "amount", zIndex: 4, durationMs: 800, delayMs: 100 },
  ]),
  def("potWin", 3, 1800, [
    { type: "burst", zIndex: 0, durationMs: 500, params: { rays: 12 } },
    { type: "particles", zIndex: 1, durationMs: 600 },
    { type: "flash", zIndex: 2, durationMs: 400 },
    { type: "ring", zIndex: 3, durationMs: 700 },
    { type: "typography", zIndex: 4, durationMs: 1100, params: { size: "xlarge" } },
    { type: "amount", zIndex: 5, durationMs: 900, delayMs: 80 },
  ]),
  def("potWin", 4, 2200, [
    { type: "burst", zIndex: 0, durationMs: 600, params: { rays: 16 } },
    { type: "particles", zIndex: 1, durationMs: 800 },
    { type: "flash", zIndex: 2, durationMs: 500 },
    { type: "ring", zIndex: 3, durationMs: 800 },
    { type: "typography", zIndex: 4, durationMs: 1400, delayMs: 100, params: { size: "xlarge", glow: true } },
    { type: "amount", zIndex: 5, durationMs: 1000, delayMs: 150 },
  ]),
  def("allIn", 0, 1000, [
    { type: "typography", zIndex: 1, durationMs: 700, params: { size: "medium" } },
  ]),
  def("allIn", 1, 1200, [
    { type: "flash", zIndex: 0, durationMs: 250 },
    { type: "typography", zIndex: 1, durationMs: 900, delayMs: 50, params: { size: "large" } },
  ]),
  def("allIn", 2, 1500, [
    { type: "burst", zIndex: 0, durationMs: 400, params: { rays: 6 } },
    { type: "flash", zIndex: 1, durationMs: 300 },
    { type: "typography", zIndex: 2, durationMs: 1000, params: { size: "large" } },
  ]),
  def("allIn", 3, 1800, [
    { type: "burst", zIndex: 0, durationMs: 500, params: { rays: 10 } },
    { type: "particles", zIndex: 1, durationMs: 500 },
    { type: "flash", zIndex: 2, durationMs: 350 },
    { type: "typography", zIndex: 3, durationMs: 1200, delayMs: 80, params: { size: "xlarge", glow: true } },
  ]),
  def("allIn", 4, 2200, [
    { type: "burst", zIndex: 0, durationMs: 600, params: { rays: 16 } },
    { type: "particles", zIndex: 1, durationMs: 700 },
    { type: "flash", zIndex: 2, durationMs: 450 },
    { type: "typography", zIndex: 3, durationMs: 1500, delayMs: 100, params: { size: "xlarge", glow: true } },
    { type: "amount", zIndex: 4, durationMs: 800, delayMs: 200 },
  ]),
  def("showdown", 0, 1000, [
    { type: "typography", zIndex: 1, durationMs: 800, params: { size: "medium" } },
  ]),
  def("showdown", 1, 1200, [
    { type: "flash", zIndex: 0, durationMs: 300 },
    { type: "typography", zIndex: 1, durationMs: 900, params: { size: "large" } },
  ]),
  def("showdown", 2, 1500, [
    { type: "burst", zIndex: 0, durationMs: 400, params: { rays: 8 } },
    { type: "flash", zIndex: 1, durationMs: 350 },
    { type: "typography", zIndex: 2, durationMs: 1000, params: { size: "large" } },
  ]),
  def("showdown", 3, 1800, [
    { type: "burst", zIndex: 0, durationMs: 500, params: { rays: 12 } },
    { type: "particles", zIndex: 1, durationMs: 600 },
    { type: "flash", zIndex: 2, durationMs: 400 },
    { type: "typography", zIndex: 3, durationMs: 1200, params: { size: "xlarge", glow: true } },
  ]),
  def("showdown", 4, 2200, [
    { type: "burst", zIndex: 0, durationMs: 600, params: { rays: 16 } },
    { type: "particles", zIndex: 1, durationMs: 800 },
    { type: "flash", zIndex: 2, durationMs: 500 },
    { type: "typography", zIndex: 3, durationMs: 1400, params: { size: "xlarge", glow: true } },
  ]),
];

const BY_KEY = new Map<string, TableAnimationDefinition>();
for (const d of REGISTRY) {
  BY_KEY.set(`${d.id}:${d.tier}`, d);
}

export function getTableAnimationDefinition(
  id: TableAnimationEffectId,
  tier: number
): TableAnimationDefinition | undefined {
  const clamped = Math.max(0, Math.min(4, Math.floor(tier)));
  return BY_KEY.get(`${id}:${clamped}`) ?? BY_KEY.get(`${id}:0`);
}
