import pokersolver from "pokersolver";

const { Hand } = pokersolver as {
  Hand: {
    solve(cards: string[]): any;
    winners(hands: any[]): any[];
  };
};

const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"] as const;
const SUITS = ["s", "h", "d", "c"] as const;

function buildDeck(): string[] {
  const deck: string[] = [];
  for (const r of RANKS) {
    for (const s of SUITS) deck.push(`${r}${s}`);
  }
  return deck;
}

function isHeroTieOrBetterAtShowdown(heroCards: string[], villainCards: string[], board: string[]): boolean {
  const heroSolved = Hand.solve([...heroCards, ...board]);
  const villainSolved = Hand.solve([...villainCards, ...board]);
  const winners = Hand.winners([heroSolved, villainSolved]);
  return winners.includes(heroSolved);
}

/**
 * MVP outs definition:
 * - Heads-up only
 * - FLOP/TURN only
 * - Count cards that make hero at least tie by showdown
 * - FLOP: count TURN cards where at least one RIVER exists producing tie-or-better
 * - TURN: count RIVER cards producing tie-or-better
 */
export function calcHeadsUpTieOrBetterOuts(params: {
  street: "FLOP" | "TURN";
  board: string[];
  heroCards: string[];
  villainCards: string[];
}): number {
  const { street, board, heroCards, villainCards } = params;
  if (street === "FLOP" && board.length !== 3) return 0;
  if (street === "TURN" && board.length !== 4) return 0;
  if (heroCards.length !== 2 || villainCards.length !== 2) return 0;

  const used = new Set<string>([...board, ...heroCards, ...villainCards]);
  const remaining = buildDeck().filter((c) => !used.has(c));

  if (street === "TURN") {
    let outs = 0;
    for (const river of remaining) {
      if (isHeroTieOrBetterAtShowdown(heroCards, villainCards, [...board, river])) outs++;
    }
    return outs;
  }

  let outs = 0;
  for (const turn of remaining) {
    const rest = remaining.filter((c) => c !== turn);
    let isOut = false;
    for (const river of rest) {
      if (isHeroTieOrBetterAtShowdown(heroCards, villainCards, [...board, turn, river])) {
        isOut = true;
        break;
      }
    }
    if (isOut) outs++;
  }
  return outs;
}

