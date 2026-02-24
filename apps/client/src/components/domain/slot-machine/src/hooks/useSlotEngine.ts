import { useEffect, useMemo } from "react";
import type { SlotGame, SymbolKey } from "../games/types";
import { randInt } from "../engine/rng";
import { evaluate } from "../engine/evaluate";
import { buildSlotTuningProfile } from "../engine/tuning";
import { validateSlotGameConfig } from "../engine/validateGame";

export function useSlotEngine(game: SlotGame) {
  const configIssues = useMemo(() => validateSlotGameConfig(game), [game]);
  const tuning = useMemo(() => buildSlotTuningProfile(game), [game]);

  useEffect(() => {
    if (typeof __DEV__ !== "undefined" && __DEV__ && configIssues.length > 0) {
      console.warn(`[slot] Game config issues for "${game.id}":\n- ${configIssues.join("\n- ")}`);
    }
  }, [configIssues, game.id]);

  function spin() {
    const stops = [
      randInt(game.reels[0].length),
      randInt(game.reels[1].length),
      randInt(game.reels[2].length),
    ] as const;

    const result: SymbolKey[] = [
      game.reels[0][stops[0]],
      game.reels[1][stops[1]],
      game.reels[2][stops[2]],
    ];

    const evaluated = evaluate(game, result);
    const isJackpot = evaluated.key === game.jackpotKey;
    const probability = tuning.probabilityByOutcomeKey[evaluated.key] ?? 0;
    return { stops, result, winUnits: evaluated.winUnits, isJackpot, outcomeKind: evaluated.kind, outcomeKey: evaluated.key, matchedSymbol: evaluated.matchedSymbol, probability };
  }
  return { spin, tuning, configIssues };
}
