import type { SlotGame, SymbolKey } from "../games/types";

function parseComboKey(key: string): SymbolKey[] | null {
  const parts = key.split(",");
  if (parts.length !== 3) return null;
  return parts as SymbolKey[];
}

export function validateSlotGameConfig(game: SlotGame): string[] {
  const issues: string[] = [];
  const symbolSet = new Set(game.symbols);

  if (game.reels.length !== 3) {
    issues.push(`Expected 3 reels, got ${game.reels.length}.`);
  }

  game.reels.forEach((reel, reelIdx) => {
    if (reel.length === 0) {
      issues.push(`Reel ${reelIdx + 1} is empty.`);
    }
    reel.forEach((symbol, symIdx) => {
      if (!symbolSet.has(symbol)) {
        issues.push(`Reel ${reelIdx + 1} index ${symIdx} uses unknown symbol "${symbol}".`);
      }
    });
  });

  for (const comboKey of Object.keys(game.paytable)) {
    const parsed = parseComboKey(comboKey);
    if (parsed == null) {
      issues.push(`Invalid paytable combo key "${comboKey}". Expected format "X,Y,Z".`);
      continue;
    }
    parsed.forEach((symbol) => {
      if (!symbolSet.has(symbol)) {
        issues.push(`Paytable combo "${comboKey}" references unknown symbol "${symbol}".`);
      }
    });
  }

  if (game.pairPaytable != null) {
    for (const symbol of Object.keys(game.pairPaytable) as SymbolKey[]) {
      if (!symbolSet.has(symbol)) {
        issues.push(`pairPaytable references unknown symbol "${symbol}".`);
      }
    }
  }

  if (game.anySevenPayout != null && game.anySevenPayout < 0) {
    issues.push("anySevenPayout cannot be negative.");
  }

  if (!Object.prototype.hasOwnProperty.call(game.paytable, game.jackpotKey)) {
    issues.push(`jackpotKey "${game.jackpotKey}" does not exist in paytable.`);
  }

  return issues;
}
