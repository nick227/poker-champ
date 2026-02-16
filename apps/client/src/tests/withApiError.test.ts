import { describe, expect, it } from "vitest";
import { ApiError } from "@poker-champ/sdk";
import { withApiError } from "@/services/_helpers/withApiError";

describe("withApiError", () => {
  it("returns ok result for object payloads", async () => {
    const result = await withApiError(async () => ({ value: 42 }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.value).toBe(42);
    }
  });

  it("normalizes invalid response shape", async () => {
    const result = await withApiError(async () => "bad" as unknown as { value: number });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_RESPONSE");
      expect(result.error.status).toBe(500);
      expect(result.error.ux?.kind).toBe("toast");
    }
  });

  it("maps api error to ux behavior", async () => {
    const result = await withApiError(async () => {
      throw new ApiError("Unauthorized", { status: 401, code: "UNAUTHORIZED" });
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("UNAUTHORIZED");
      expect(result.error.ux?.kind).toBe("redirect");
      expect(result.error.ux?.to).toBe("/login");
    }
  });
});

