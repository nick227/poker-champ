import { describe, expect, it } from "vitest";
import {
  listEnabledBotSummaries,
  resolveBotSelectionForAdd,
  type BotCatalogEntry,
} from "../engine/bots/BotCatalog.js";

describe("bot catalog character surface", () => {
  it("returns only enabled bots, sorted deterministically by name then id", () => {
    const source: BotCatalogEntry[] = [
      { id: "zeta", name: "Beta", brainType: "random_v1", isEnabled: true },
      { id: "alpha", name: "Alpha", brainType: "random_v1", isEnabled: true },
      { id: "alpha2", name: "Alpha", brainType: "random_v1", isEnabled: true },
      { id: "hidden", name: "Aardvark", brainType: "random_v1", isEnabled: false },
    ];

    const summaries = listEnabledBotSummaries(source);
    expect(summaries).toEqual([
      { id: "alpha", name: "Alpha", avatarUrl: undefined },
      { id: "alpha2", name: "Alpha", avatarUrl: undefined },
      { id: "zeta", name: "Beta", avatarUrl: undefined },
    ]);
  });

  it("returns an empty array when catalog has no enabled bots", () => {
    const source: BotCatalogEntry[] = [
      { id: "x", name: "X", brainType: "random_v1", isEnabled: false },
    ];
    expect(listEnabledBotSummaries(source)).toEqual([]);
  });

  it("rejects unknown botId for add-bot selection", () => {
    const source: BotCatalogEntry[] = [
      { id: "known", name: "Known", brainType: "random_v1", isEnabled: true },
    ];
    expect(resolveBotSelectionForAdd("missing", source)).toEqual({
      ok: false,
      reason: "UNKNOWN_OR_DISABLED_BOT",
    });
  });

  it("rejects disabled botId for add-bot selection", () => {
    const source: BotCatalogEntry[] = [
      { id: "disabled", name: "Disabled", brainType: "random_v1", isEnabled: false },
    ];
    expect(resolveBotSelectionForAdd("disabled", source)).toEqual({
      ok: false,
      reason: "UNKNOWN_OR_DISABLED_BOT",
    });
  });
});

