import { describe, expect, it } from "vitest";
import { formatLobbyCount, formatLobbyDurationMs, formatLobbyUsd } from "./lobbyFormat";

describe("formatLobbyUsd", () => {
  it("keeps two decimal places", () => {
    expect(formatLobbyUsd(50)).toBe("$0.50");
    expect(formatLobbyUsd(25)).toBe("$0.25");
    expect(formatLobbyUsd(2840)).toBe("$28.40");
  });
});

describe("formatLobbyCount", () => {
  it("spaces the slash and dashes empty max", () => {
    expect(formatLobbyCount(6, 9)).toBe("6 / 9");
    expect(formatLobbyCount(0, 0)).toBe("—");
  });
});

describe("formatLobbyDurationMs", () => {
  it("formats minutes and hours", () => {
    expect(formatLobbyDurationMs(12 * 60_000)).toBe("12 min");
    expect(formatLobbyDurationMs(72 * 60_000)).toBe("1 h 12 min");
    expect(formatLobbyDurationMs(0)).toBeNull();
  });
});
