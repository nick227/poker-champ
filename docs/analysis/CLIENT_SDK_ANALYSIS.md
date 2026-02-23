# Client SDK State Analysis

## Scope
This document summarizes the current state of the client SDK in this repository across:
- SDK format and structure
- SDK generation pipeline
- SDK consumption model
- strengths, gaps, and improvements

## Current SDK Format

### Package layout
- `packages/sdk/src/types.gen.ts`: generated OpenAPI TypeScript types (`paths`, components, operations)
- `packages/sdk/src/client.ts`: low-level HTTP client wrapper around `fetch`
- `packages/sdk/src/endpoints.ts`: typed endpoint functions built on generated `paths`
- `packages/sdk/src/context.ts`: runtime injection for base URL and auth token
- `packages/sdk/src/version.ts`: `SDK_VERSION` constant
- `packages/sdk/src/index.ts`: package public exports

### Error model
- Unified error type: `ApiError` with:
  - `status: number`
  - `code?: string`
  - `details?: any`
- All non-2xx HTTP responses are normalized and thrown as `ApiError`.
- Network failures are also normalized as `ApiError` (`code: "NETWORK_ERROR"`).

### Auth and runtime context
- SDK is decoupled from framework state by explicit runtime setters:
  - `setApiBaseUrl(url)`
  - `setAuthToken(token)`
- `client.ts` reads these through context getters unless overridden via `createApiClient` options.

### Endpoint shape
- Two usage styles are available:
  - Flat API (`createSdk`) e.g. `authLogin`, `economyBuyIn`
  - Namespaced API (`createNamespacedSdk` + default exports) e.g. `auth.login`, `economy.buyIn`
- Namespaced default exports support tree-shakable imports like:
  - `import { auth } from "@poker-champ/sdk"`

## Generation Pipeline

### Contract source
- Source of truth: `src/http/openapi.ts`
- Runtime contract endpoint: `GET /openapi.json`

### Scripts
- `npm run openapi:export`
  - Exports `openApiSpec` to root `openapi.json`
- `npm run sdk:gen`
  - Runs export + `openapi-typescript` to generate `packages/sdk/src/types.gen.ts`
- `npm run sdk:check`
  - Regenerates SDK types and type-checks `packages/sdk`

### CI enforcement
- Workflow: `.github/workflows/contract-first.yml`
- Validates that contract and generated SDK stay in sync:
  - runs `sdk:gen`
  - fails on drift in `openapi.json` or `packages/sdk/src/types.gen.ts`
  - runs `sdk:check`
  - runs `ui:no-fetch`
  - runs full build

## Consumption Model

### Expected usage
1. Configure SDK once:
   - `setApiBaseUrl(API_URL)`
   - `setAuthToken(tokenOrNull)`
2. Import namespaced endpoint groups and call typed functions.
3. Catch `ApiError` in UI or state layer for consistent error handling.

### UI guardrail
- Script `npm run ui:no-fetch` scans UI directories and fails on direct `fetch(` usage.
- This enforces API access through SDK abstractions.

## Server/Contract Validation Alignment

- Request validation: enabled via `express-openapi-validator`.
- Response validation: enabled in non-production only:
  - `validateResponses: process.env.NODE_ENV !== "production"`
- This gives strong safety in dev/staging with lower production overhead.

## Versioning State

- OpenAPI version is stamped from environment:
  - `info.version = process.env.API_VERSION ?? "0.1.0"`
- SDK exposes:
  - `SDK_VERSION = "0.1.0"`
- This enables client/server version mismatch logging.

## Strengths
- Contract-first flow is implemented and CI-enforced.
- Typed SDK derives from OpenAPI, reducing hand-maintained type drift.
- Runtime context injection decouples SDK from UI framework state containers.
- Error shape is normalized across network and API failures.
- Request/response validation catches contract bugs early.

## Gaps / Risks
- `SDK_VERSION` is hardcoded and not automatically synchronized with `API_VERSION`.
- `types.gen.ts` is generated from `openapi.json`, which is exported from TS source; this is solid, but drift can still occur if manual edits are made to generated files locally.
- No published package workflow yet (currently private workspace package only).
- No dedicated SDK usage examples/tests in a real UI app are present in this repository.

## Recommended Next Improvements
1. Auto-sync SDK version
- Generate `packages/sdk/src/version.ts` from `process.env.API_VERSION` during `sdk:gen`.

2. Add SDK smoke tests
- Add minimal tests for:
  - auth header injection
  - query serialization
  - `ApiError` normalization paths
  - path parameter replacement

3. Add mismatch diagnostics
- Add helper that compares server-reported OpenAPI version with `SDK_VERSION` and logs warnings.

4. Improve generated operation ergonomics
- Consider generating endpoint wrappers from OpenAPI operation metadata to reduce hand-maintained `endpoints.ts`.

## Bottom Line
The SDK architecture is in a strong state for contract-first development: typed, validated, CI-enforced, and consumable through stable namespaced imports. The highest-value remaining work is version auto-sync and a small SDK test suite.

