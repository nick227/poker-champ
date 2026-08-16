import { afterEach, describe, expect, it } from "vitest";
import { isPersistentSeatsEnabled } from "./features.js";

describe("persistent seat feature", () => {
  const previous = process.env.FEATURE_PERSISTENT_SEATS;

  afterEach(() => {
    if (previous == null) delete process.env.FEATURE_PERSISTENT_SEATS;
    else process.env.FEATURE_PERSISTENT_SEATS = previous;
  });

  it("is foundational by default with an explicit rollback opt-out", () => {
    delete process.env.FEATURE_PERSISTENT_SEATS;
    expect(isPersistentSeatsEnabled()).toBe(true);
    process.env.FEATURE_PERSISTENT_SEATS = "false";
    expect(isPersistentSeatsEnabled()).toBe(false);
  });
});
