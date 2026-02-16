import { describe, expect, it } from "vitest";
import { canStartRealtimeSession } from "@/realtime/useRealtimeChannel";

describe("useRealtimeChannel guard", () => {
  it("blocks table realtime before auth hydration", () => {
    expect(
      canStartRealtimeSession({
        scope: "table",
        enabled: true,
        authHydrated: false,
        authToken: "token",
      }),
    ).toBe(false);
  });

  it("blocks table realtime when token is missing", () => {
    expect(
      canStartRealtimeSession({
        scope: "table",
        enabled: true,
        authHydrated: true,
        authToken: null,
      }),
    ).toBe(false);
  });

  it("allows table realtime only when hydrated and token exists", () => {
    expect(
      canStartRealtimeSession({
        scope: "table",
        enabled: true,
        authHydrated: true,
        authToken: "token",
      }),
    ).toBe(true);
  });
});
