import { describe, it, expect } from "vitest";
import { PersistenceFacade } from "../engine/persistence/PersistenceFacade.js";

describe("PersistenceFacade", () => {
  it("is disabled when DATABASE_URL is missing", () => {
    const old = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    const p = new PersistenceFacade("table_test");
    expect(p.enabled).toBe(false);

    if (old) process.env.DATABASE_URL = old;
  });
});
