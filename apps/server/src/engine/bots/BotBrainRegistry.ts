import { logger } from "../../lib/logger.js";
import type { BotBrain } from "./BotBrain.js";
import { RandomBotBrain } from "./BotBrain.js";
import type { BotBrainType } from "./BotCatalog.js";
import { loadTightAggressiveConfig } from "./brains/tight_aggressive/runtime/loadTightAggressiveConfig.js";
import tightAggressiveConfig from "./brains/tight_aggressive/config/tightAggressive.config.js";
import { TightAggressiveBrain } from "./brains/tight_aggressive/TightAggressiveBrain.js";
import { LoosePassiveBrain, TightPassiveBrain } from "./brains/passive/PassiveProfileBrains.js";
import { LooseAggressiveBrain } from "./brains/aggressive/LooseAggressiveBrain.js";

const randomBrainSingleton = new RandomBotBrain();
const tightAggressiveBrainSingleton = new TightAggressiveBrain(loadTightAggressiveConfig(tightAggressiveConfig));
const tightPassiveBrainSingleton = new TightPassiveBrain();
const loosePassiveBrainSingleton = new LoosePassiveBrain();
const looseAggressiveBrainSingleton = new LooseAggressiveBrain();
const botBrainRegistry: Record<BotBrainType, BotBrain> = {
  random_v1: randomBrainSingleton,
  weighted_v1: randomBrainSingleton,
  tight_aggressive_v1: tightAggressiveBrainSingleton,
  tight_passive_v1: tightPassiveBrainSingleton,
  loose_aggressive_v1: looseAggressiveBrainSingleton,
  loose_passive_v1: loosePassiveBrainSingleton,
  ai_v1: randomBrainSingleton,
};

export function createBotBrain(brainType: BotBrainType): BotBrain {
  if (
    brainType === "weighted_v1" ||
    brainType === "ai_v1"
  ) {
    logger.warn({ brainType }, "BOT_BRAIN_NOT_IMPLEMENTED_FALLBACK_RANDOM");
  }
  const resolved = botBrainRegistry[brainType as BotBrainType];
  if (!resolved) {
    logger.warn({ brainType }, "BOT_BRAIN_UNKNOWN_FALLBACK_RANDOM");
    return randomBrainSingleton;
  }
  return resolved;
}
