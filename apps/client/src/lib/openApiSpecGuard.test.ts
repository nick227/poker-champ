import { describe, expect, it } from "vitest";
import {
  serverOpenApiHasTournamentEnsureTable,
  TOURNAMENT_ENSURE_TABLE_OPENAPI_PATH,
} from "@/lib/openApiSpecGuard";

describe("openApiSpecGuard", () => {
  it("detects tournament ensure-table path", () => {
    expect(
      serverOpenApiHasTournamentEnsureTable({
        paths: { [TOURNAMENT_ENSURE_TABLE_OPENAPI_PATH]: { post: {} } },
      }),
    ).toBe(true);
    expect(serverOpenApiHasTournamentEnsureTable({ paths: {} })).toBe(false);
    expect(serverOpenApiHasTournamentEnsureTable(null)).toBe(false);
  });
});
