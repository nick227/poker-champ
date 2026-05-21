import { describe, expect, it } from "vitest";
import { captureReconnectionToken, classifyConnectFailure } from "@/realtime/transport";

describe("captureReconnectionToken", () => {
  it("prefixes room id when token has no colon", () => {
    expect(
      captureReconnectionToken({
        roomId: "room_abc",
        reconnectionToken: "tok_xyz",
      }),
    ).toBe("room_abc:tok_xyz");
  });

  it("passes through combined token", () => {
    expect(
      captureReconnectionToken({
        roomId: "room_abc",
        reconnectionToken: "room_abc:tok_xyz",
      }),
    ).toBe("room_abc:tok_xyz");
  });
});

describe("classifyConnectFailure", () => {
  it("treats disposed room errors as terminal", () => {
    expect(
      classifyConnectFailure(
        '❌ room "UucHSt_SA" has been disposed. Did you miss .allowReconnection()?',
      ),
    ).toBe("terminal");
  });

  it("treats transient network errors as retryable", () => {
    expect(classifyConnectFailure("Failed to fetch")).toBe("retryable");
  });
});
