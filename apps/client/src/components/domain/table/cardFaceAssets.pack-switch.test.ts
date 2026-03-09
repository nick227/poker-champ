import { describe, expect, it, vi } from "vitest";

vi.mock("@/assets/cards/packs", () => ({
  DEFAULT_CARD_FACE_PACK_ID: "default",
  CARD_FACE_PACKS: {
    default: {
      ace_of_spades: "default_ace_spades",
      king_of_spades: "default_king_spades",
    },
    linen: {
      ace_of_spades: "linen_ace_spades",
    },
  },
}));

import { getCardFaceSource } from "@/components/domain/table/cardFaceAssets";

describe("cardFaceAssets pack switching", () => {
  it("switches returned source when pack id changes", () => {
    const fromDefault = getCardFaceSource("A", "s", "default" as never);
    const fromLinen = getCardFaceSource("A", "s", "linen" as never);

    expect(fromDefault).toBe("default_ace_spades");
    expect(fromLinen).toBe("linen_ace_spades");
    expect(fromDefault).not.toBe(fromLinen);
  });

  it("returns null safely when selected pack is missing a specific card key", () => {
    const source = getCardFaceSource("K", "s", "linen" as never);
    expect(source).toBeNull();
  });
});

