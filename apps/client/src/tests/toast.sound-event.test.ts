import { describe, expect, it } from "vitest";
import { getSoundEventForToastVariant } from "@/sound/toastSoundEvent";

describe("toast sound event mapping", () => {
  it("maps non-danger toast variants to app.toast", () => {
    expect(getSoundEventForToastVariant("default")).toBe("app.toast");
    expect(getSoundEventForToastVariant("success")).toBe("app.toast");
  });

  it("maps danger variant to app.error", () => {
    expect(getSoundEventForToastVariant("danger")).toBe("app.error");
  });
});
