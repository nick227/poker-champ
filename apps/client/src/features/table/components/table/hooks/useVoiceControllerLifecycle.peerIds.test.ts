import { describe, expect, it } from "vitest";
import { peerIdsFromSeats } from "./useVoiceControllerLifecycle";

describe("peerIdsFromSeats", () => {
  it("returns empty when seats or heroUserId missing", () => {
    expect(peerIdsFromSeats(undefined, "h1")).toEqual([]);
    expect(peerIdsFromSeats([], null)).toEqual([]);
    expect(peerIdsFromSeats([{ userId: "a" }], undefined)).toEqual([]);
  });

  it("excludes hero and returns occupied connected non-bot user ids sorted", () => {
    const seats = [
      { occupied: true, isBot: false, connected: true, userId: "b" },
      { occupied: true, isBot: true, connected: true, userId: "bot1" },
      { occupied: true, isBot: false, connected: false, userId: "c" },
      { occupied: false, isBot: false, connected: true, userId: "d" },
      { occupied: true, isBot: false, connected: true, userId: "hero" },
      { occupied: true, isBot: false, connected: true, userId: "a" },
    ];
    expect(peerIdsFromSeats(seats, "hero")).toEqual(["a", "b"]);
  });

  it("stringifies userId", () => {
    const seats = [{ occupied: true, isBot: false, connected: true, userId: 12345 }];
    expect(peerIdsFromSeats(seats, "h")).toEqual(["12345"]);
  });
});

