import { describe, it, expect } from "vitest";
import type { ImageSourcePropType } from "react-native";
import { getCardFaceSource } from "@/components/domain/table/cardFaceAssets";
import { CARD_FACE_PACKS, DEFAULT_CARD_FACE_PACK_ID } from "@/assets/cards/packs";

describe("cardFaceAssets.getCardFaceSource", () => {
  it("returns null when rank or suit is missing", () => {
    expect(getCardFaceSource(undefined, "s")).toBeNull();
    expect(getCardFaceSource("A", undefined)).toBeNull();
    expect(getCardFaceSource(undefined, undefined)).toBeNull();
  });

  it("maps uppercase rank and lowercase suit to a packed image source", () => {
    const source = getCardFaceSource("A", "s");

    expect(source).not.toBeNull();
    const key = "ace_of_spades";
    expect(CARD_FACE_PACKS[DEFAULT_CARD_FACE_PACK_ID][key]).toBe(source as ImageSourcePropType);
  });

  it("normalizes rank and suit case before lookup", () => {
    const fromLower = getCardFaceSource("a", "S");
    const fromUpper = getCardFaceSource("A", "s");

    expect(fromLower).toBe(fromUpper);
  });

  it("returns null for unsupported suit codes", () => {
    const source = getCardFaceSource("A", "x");
    expect(source).toBeNull();
  });

  it("falls back to null when key is not present in the pack", () => {
    const badRank = "Z";
    const source = getCardFaceSource(badRank, "s");
    expect(source).toBeNull();
  });

  it("maps both 'T' and '10' ranks to the same ten card key", () => {
    const fromT = getCardFaceSource("T", "d");
    const fromTen = getCardFaceSource("10", "d");

    expect(fromT).toBe(fromTen);
    const key = "10_of_diamonds";
    expect(CARD_FACE_PACKS[DEFAULT_CARD_FACE_PACK_ID][key]).toBe(fromT as ImageSourcePropType);
  });

  it("is strict about garbage input like whitespace and multi-character ranks", () => {
    expect(getCardFaceSource(" A ", "s")).toBeNull();
    expect(getCardFaceSource("A", " s ")).toBeNull();
    expect(getCardFaceSource("Ah", "s")).toBeNull();
  });

  it("has a valid default pack id and exactly 52 entries in the default pack", () => {
    expect(Object.prototype.hasOwnProperty.call(CARD_FACE_PACKS, DEFAULT_CARD_FACE_PACK_ID)).toBe(true);

    const defaultPack = CARD_FACE_PACKS[DEFAULT_CARD_FACE_PACK_ID];
    expect(Object.keys(defaultPack).length).toBe(52);
    expect(defaultPack["ace_of_spades"]).toBeDefined();
    expect(defaultPack["2_of_clubs"]).toBeDefined();
  });
});

