import { describe, expect, it } from "vitest";
import { toServerActionPayload } from "@/realtime/action.mapper";

describe("action mapper", () => {
  it("maps lowercase UI action to uppercase server payload with actionId", () => {
    const payload = toServerActionPayload({ action: "raise", amountCents: 250 });
    expect(payload).toMatchObject({ action: "RAISE", amountCents: 250 });
    expect(typeof payload.actionId).toBe("string");
    expect(payload.actionId.length).toBeGreaterThan(0);
  });

  it("includes actionId for idempotent retries", () => {
    const payload = toServerActionPayload({ action: "fold" });
    expect(payload.action).toBe("FOLD");
    expect(typeof payload.actionId).toBe("string");
  });
});
