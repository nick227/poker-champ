/**
 * Canonical card encoding: "Ah", "Td", "7s"
 * - ranks: A K Q J T 9..2
 * - suits: h d c s
 */

const RANKS = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"] as const;
const SUITS = ["c","d","h","s"] as const;

export function isCard(s: string): boolean {
  return s.length === 2 && (RANKS as readonly string[]).includes(s[0]) && (SUITS as readonly string[]).includes(s[1]);
}
