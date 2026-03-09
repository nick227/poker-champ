import { describe, it, expect } from "vitest";
import type { ImageSourcePropType } from "react-native";
import { getCardFaceSource, keyToRankSuit } from "@/components/domain/table/cardFaceAssets";
import {
  CARD_FACE_PACKS,
  DEFAULT_CARD_FACE_PACK_ID,
  getValidCardFacePackId,
  isCardFacePackId,
} from "@/assets/cards/packs";

describe("cardFaceAssets.getCardFaceSource", () => {
  it("returns null when rank or suit is missing", () => {
    expect(getCardFaceSource(undefined, "s")).toBeNull();
    expect(getCardFaceSource("A", undefined)).toBeNull();
    expect(getCardFaceSource(undefined, undefined)).toBeNull();
  });

  it("maps uppercase rank and lowercase suit to a packed image source", () => {
    const source = getCardFaceSource("A", "s", "default");

    expect(source).not.toBeNull();
    const key = "ace_of_spades";
    expect(CARD_FACE_PACKS["default"][key]).toBe(source as ImageSourcePropType);
  });

  it("normalizes rank and suit case before lookup", () => {
    const fromLower = getCardFaceSource("a", "S", "default");
    const fromUpper = getCardFaceSource("A", "s", "default");

    expect(fromLower).toBe(fromUpper);
    expect(fromLower).not.toBeNull();
  });

  it("returns null for unsupported suit codes", () => {
    const source = getCardFaceSource("A", "x");
    expect(source).toBeNull();
  });

  it("falls back to null when key is not present in the pack", () => {
    const badRank = "Z";
    const source = getCardFaceSource(badRank, "s", "default");
    expect(source).toBeNull();
  });

  it("maps both 'T' and '10' ranks to the same ten card key", () => {
    const fromT = getCardFaceSource("T", "d", "default");
    const fromTen = getCardFaceSource("10", "d", "default");

    expect(fromT).toBe(fromTen);
    const key = "10_of_diamonds";
    expect(CARD_FACE_PACKS["default"][key]).toBe(fromT as ImageSourcePropType);
  });

  it("is strict about garbage input like whitespace and multi-character ranks", () => {
    expect(getCardFaceSource(" A ", "s")).toBeNull();
    expect(getCardFaceSource("A", " s ")).toBeNull();
    expect(getCardFaceSource("Ah", "s")).toBeNull();
  });

  it("has a valid default pack id and image pack default has 52 entries", () => {
    expect(isCardFacePackId(DEFAULT_CARD_FACE_PACK_ID)).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(CARD_FACE_PACKS, "default")).toBe(true);

    const defaultImagePack = CARD_FACE_PACKS["default"];
    expect(Object.keys(defaultImagePack).length).toBe(52);
    expect(defaultImagePack["ace_of_spades"]).toBeDefined();
    expect(defaultImagePack["2_of_clubs"]).toBeDefined();
  });

  it("returns null for builtin pack id (no image lookup)", () => {
    expect(getCardFaceSource("A", "s", "simple")).toBeNull();
  });

  it("isCardFacePackId accepts builtin and image pack ids", () => {
    expect(isCardFacePackId("simple")).toBe(true);
    expect(isCardFacePackId("default")).toBe(true);
  });

  it("falls back to DEFAULT_CARD_FACE_PACK_ID when persisted value is invalid", () => {
    expect(getValidCardFacePackId("default")).toBe("default");
    expect(getValidCardFacePackId("simple")).toBe("simple");
    expect(getValidCardFacePackId("not-a-pack")).toBe(DEFAULT_CARD_FACE_PACK_ID);
    expect(getValidCardFacePackId(null)).toBe(DEFAULT_CARD_FACE_PACK_ID);
    expect(getValidCardFacePackId(undefined)).toBe(DEFAULT_CARD_FACE_PACK_ID);
  });
});

describe("cardFaceAssets.keyToRankSuit", () => {
  it("parses card face key to rank and suit codes", () => {
    expect(keyToRankSuit("ace_of_spades")).toEqual({ rank: "A", suit: "s" });
    expect(keyToRankSuit("king_of_hearts")).toEqual({ rank: "K", suit: "h" });
    expect(keyToRankSuit("10_of_diamonds")).toEqual({ rank: "T", suit: "d" });
    expect(keyToRankSuit("7_of_clubs")).toEqual({ rank: "7", suit: "c" });
  });

  it("returns null for invalid key format", () => {
    expect(keyToRankSuit("invalid")).toBeNull();
    expect(keyToRankSuit("ace_spades")).toBeNull();
  });
});
