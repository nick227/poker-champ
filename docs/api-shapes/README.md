# API Shape Explorer

Internal, local-only docs for request/response shapes generated from `openapi.json` and SDK endpoint mappings.

## Commands

- Generate data:
  - `pnpm api:shapes:gen`
- Generate and serve viewer:
  - `pnpm api:shapes:serve`
  - default URL: `http://localhost:4174`

## What It Shows

- Endpoints with:
  - path + method
  - request path/query params
  - request body shape
  - response shapes by status code
  - matched SDK methods (`namespace.method`)
- OpenAPI component models as collapsible trees

## Source of Truth

- OpenAPI: `openapi.json`
- SDK mapping source: `packages/sdk/src/endpoints.ts`
- Generated output: `docs/api-shapes/data.json`

## Recommended Workflow

1. Regenerate SDK (`pnpm sdk:gen`) when API changes.
2. Regenerate shape docs (`pnpm api:shapes:gen`).
3. Open the explorer (`pnpm api:shapes:serve`).
