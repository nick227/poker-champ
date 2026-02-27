import React from "react";
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as cardFaceAssets from "@/components/domain/table/cardFaceAssets";
import { PlayingCard } from "@/components/domain/table/PlayingCard";

vi.mock("@/stores/preferences.store", () => ({
  usePreferencesStore: () => ({
    cardBackPattern: "classic",
    cardBackHue: 217,
    cardBackSaturation: 50,
    cardBackLightness: 22,
  }),
}));

describe("PlayingCard (image card faces)", () => {
  it("renders an Image when getCardFaceSource returns a source", () => {
    const spy = vi.spyOn(cardFaceAssets, "getCardFaceSource");
    const fakeSource = { uri: "dummy" };
    spy.mockReturnValue(fakeSource as any);

    const { container } = render(<PlayingCard rank="A" suit="s" />);

    expect(container.querySelector("img")).toBeTruthy();
    expect(spy).toHaveBeenCalledWith("A", "s");
  });

  it("falls back to glyph rendering when getCardFaceSource returns null", () => {
    const spy = vi.spyOn(cardFaceAssets, "getCardFaceSource");
    spy.mockReturnValue(null);

    const { getByText, container } = render(<PlayingCard rank="A" suit="s" />);

    expect(getByText("A")).toBeTruthy();
    expect(getByText("â™ ")).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
  });

  it("falls back to glyph rendering when the Image fails to load (onError)", async () => {
    const spy = vi.spyOn(cardFaceAssets, "getCardFaceSource");
    const fakeSource = { uri: "dummy" };
    spy.mockReturnValue(fakeSource as any);

    const { getByRole, getByText, container } = render(<PlayingCard rank="A" suit="s" />);

    getByRole("img").dispatchEvent(new Event("error"));

    await waitFor(() => {
      expect(getByText("A")).toBeTruthy();
      expect(getByText("â™ ")).toBeTruthy();
      expect(container.querySelector("img")).toBeNull();
    });
  });
});
