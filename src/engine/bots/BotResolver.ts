import type { ActionPayload } from "../../messages/schemas.js";
import type { PlayerState } from "../../state/PlayerState.js";
import type { BotActionContext } from "./BotBrain.js";
import { SeededRng } from "./BotBrain.js";
import { createBotBrain } from "./BotBrainRegistry.js";
import { getBotCatalogEntry, getDefaultBotCatalogEntry } from "./BotCatalog.js";
import { clampToLegalAction } from "./utils/decision.js";
import { logger } from "../../lib/logger.js";

export class BotResolver {
  pickAction(player: PlayerState, ctx: BotActionContext): ActionPayload {
    const characterId = player.botId || getDefaultBotCatalogEntry().id;
    const catalogEntry = getBotCatalogEntry(characterId) ?? getDefaultBotCatalogEntry();
    const brain = createBotBrain(catalogEntry.brainType);
    const runtimeCtx = ctx.rng ? ctx : { ...ctx, rng: new SeededRng(hashDecisionSeed(player, ctx, catalogEntry.id)) };
    const proposed = brain.pickAction(runtimeCtx);
    const clamped = clampToLegalAction(proposed, ctx.heroActionOptions);
    if (clamped.clamped) {
      logger.warn(
        {
          botRuntimeId: player.id,
          botCharacterId: catalogEntry.id,
          brainType: catalogEntry.brainType,
          reason: clamped.reason,
          proposedAction: proposed,
          resolvedAction: clamped.payload,
        },
        "BOT_ACTION_CLAMPED",
      );
    }
    return clamped.payload;
  }
}

function hashDecisionSeed(player: PlayerState, ctx: BotActionContext, catalogBotId: string): number {
  const seedText = [
    player.id,
    catalogBotId,
    ctx.handSnapshot.street,
    String(ctx.handSnapshot.potCents),
    String(ctx.handSnapshot.roundCurrentBetCents),
    String(ctx.seatSnapshot.roundBetCents),
    String(ctx.seatSnapshot.stackCents),
    String(ctx.seatSnapshot.seat),
    String(ctx.activePlayersInHand ?? 0),
    (ctx.heroHoleCards ?? []).join(","),
    ctx.handSnapshot.board.join(","),
  ].join("|");

  // FNV-1a 32-bit
  let hash = 0x811c9dc5;
  for (let i = 0; i < seedText.length; i += 1) {
    hash ^= seedText.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
