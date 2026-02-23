import type { ActionPayload } from "../../messages/schemas.js";
import type { PlayerState } from "../../state/PlayerState.js";
import type { BotActionContext } from "./BotBrain.js";
import { createBotBrain } from "./BotBrainRegistry.js";
import { getBotCatalogEntry, getDefaultBotCatalogEntry } from "./BotCatalog.js";
import { clampToLegalAction } from "./utils/decision.js";
import { logger } from "../../lib/logger.js";

export class BotResolver {
  pickAction(player: PlayerState, ctx: BotActionContext): ActionPayload {
    const characterId = player.botId || getDefaultBotCatalogEntry().id;
    const catalogEntry = getBotCatalogEntry(characterId) ?? getDefaultBotCatalogEntry();
    const brain = createBotBrain(catalogEntry.brainType);
    const proposed = brain.pickAction(ctx);
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
