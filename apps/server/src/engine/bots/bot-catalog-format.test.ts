import { describe, expect, it } from "vitest";
import { BOT_CATALOG } from "./BotCatalog.js";

describe("bot catalog format", () => {
  it("uses underscored slug ids for all bot entries", () => {
    for (const bot of BOT_CATALOG) {
      expect(bot.id).toMatch(/^[a-z0-9_]+$/);
    }
  });
});

