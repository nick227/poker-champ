import { CardGroup, OddsCalculator } from "poker-odds-calculator";

export type EquityResult = {
  // player index -> equity percent (0..100)
  equitiesPct: number[];
};

export function makeEquityCacheKey(handId: string, street: string, board: string[], players: { id: string; cards: string[] }[]): string {
  // Order by id for determinism
  const ordered = [...players].sort((a, b) => a.id.localeCompare(b.id));
  const holes = ordered.map(p => `${p.id}:${p.cards.join("")}`).join("|");
  return `${handId}::${street}::${board.join("")}::${holes}`;
}

/**
 * Multiway equity.
 * - `players` is ordered; returned equities correspond to this order.
 * - Uses exact enumeration where possible; can get heavy on preflop with many players.
 *   Cache + compute-only-on-turn keeps it manageable for POC.
 */
export function calcMultiwayEquity(players: string[][], boardCards: string[]): EquityResult {
  const hands = players.map(cards => CardGroup.fromString(cards.join("")));
  const board = CardGroup.fromString(boardCards.join(""));
  const result = OddsCalculator.calculate(hands, board);

  const equitiesPct = result.equities.map(e => e.getEquity());
  return { equitiesPct };
}

export function calcPotOdds(potCents: number, callAmountCents: number): number {
  if (callAmountCents <= 0) return 0;
  return callAmountCents / (potCents + callAmountCents);
}
