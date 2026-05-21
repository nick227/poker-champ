import { describe, expect, it } from "vitest";
import { captureReconnectionToken } from "@/realtime/transport";

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
