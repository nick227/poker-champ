import { describe, expect, it } from "vitest";
import { toServerActionPayload } from "@/realtime/action.mapper";

describe("action mapper", () => {
  it("maps lowercase UI action to uppercase server payload", () => {
    expect(toServerActionPayload({ action: "raise", amountCents: 250 })).toEqual({
      action: "RAISE",
      amountCents: 250,
    });
  });

  it("omits extra client-only fields by construction", () => {
    expect(Object.keys(toServerActionPayload({ action: "fold" }))).toEqual(["action"]);
  });
});
