/** Path key in server `/openapi.json` — must match `apps/server/src/http/openapi.ts`. */
export const TOURNAMENT_ENSURE_TABLE_OPENAPI_PATH = "/api/tournaments/{id}/ensure-table";

const STALE_OPENAPI_MESSAGE = "Restart server: OpenAPI spec is stale.";

export class StaleOpenApiSpecError extends Error {
  constructor(message = STALE_OPENAPI_MESSAGE) {
    super(message);
    this.name = "StaleOpenApiSpecError";
  }
}

export function serverOpenApiHasTournamentEnsureTable(
  spec: { paths?: Record<string, unknown> } | null | undefined,
): boolean {
  return Boolean(spec?.paths && TOURNAMENT_ENSURE_TABLE_OPENAPI_PATH in spec.paths);
}

export async function fetchServerOpenApiSpec(
  apiBaseUrl: string,
): Promise<{ paths?: Record<string, unknown> } | null> {
  const base = apiBaseUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/openapi.json`);
  if (!res.ok) return null;
  return (await res.json()) as { paths?: Record<string, unknown> };
}

export async function assertServerOpenApiHasTournamentEnsureTable(
  apiBaseUrl?: string,
): Promise<void> {
  const base = apiBaseUrl ?? String(process.env.EXPO_PUBLIC_API_URL ?? "").trim();
  if (!base) return;

  const spec = await fetchServerOpenApiSpec(base);
  if (!serverOpenApiHasTournamentEnsureTable(spec)) {
    console.error(`[OPENAPI_SPEC_GUARD] missing ${TOURNAMENT_ENSURE_TABLE_OPENAPI_PATH}`);
    throw new StaleOpenApiSpecError(STALE_OPENAPI_MESSAGE);
  }
}

export function warnStaleOpenApiSpecIfMissing(spec: { paths?: Record<string, unknown> } | null): void {
  if (!serverOpenApiHasTournamentEnsureTable(spec)) {
    console.error(`[OPENAPI_SPEC_GUARD] ${STALE_OPENAPI_MESSAGE}`);
  }
}
