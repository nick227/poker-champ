# Test Commands and CI Guide

## Scope Reviewed
- `package.json` (repo root)
- `apps/client/package.json`

## Quick Findings
- Root `package.json` currently defines no `scripts`, so there are no root-level test commands to run directly from that file.
- `apps/client/package.json` contains the active client test surface (Vitest + Playwright).

## Client Test Commands by Category

### 1. Unit and component tests (Vitest)
- `pnpm -C apps/client test`  
  Runs Vitest in watch mode.
- `pnpm -C apps/client test:run`  
  Runs the Vitest suite once (CI-friendly).

### 2. Targeted/spec-specific tests (Vitest)
- `pnpm -C apps/client test:voice`  
  Runs only `src/tests/voice.webrtc-stun.test.ts`.

### 3. End-to-end tests (Playwright)
- `pnpm -C apps/client e2e`  
  Runs full Playwright E2E suite.
- `pnpm -C apps/client e2e:ui`  
  Opens Playwright UI mode for interactive local debugging.
- `pnpm -C apps/client e2e:install`  
  Installs Chromium for Playwright.

### 4. Scenario E2E commands (single-file focused)
- `pnpm -C apps/client e2e:stack`
- `pnpm -C apps/client e2e:rejoin-buyin-override`
- `pnpm -C apps/client e2e:lessons`
- `pnpm -C apps/client e2e:lessons:canonical`
- `pnpm -C apps/client e2e:stack:ci` (sets `CI=1` for deterministic CI behavior)
- `pnpm -C apps/client e2e:churn`
- `pnpm -C apps/client e2e:auth-guard:table`

## Multi-Test Commands (Called Out)
- `pnpm -C apps/client e2e:auth-guard`  
  Runs **multiple specs in one command**:
  - `e2e/auth-guard-settings.spec.ts`
  - `e2e/auth-guard-table.spec.ts`

This is currently the clearest explicit "multi-test command" in the reviewed package files.

## Current CI State (Observed Workflows)

### Client build smoke (`.github/workflows/client-build-smoke.yml`)
- Runs `pnpm preflight:client:ci`
- Builds web via `pnpm build:web`
- Builds desktop on non-PR events via `pnpm build:desktop`
- Focus: build integrity, not direct test execution.

### Lessons canonical CI (`.github/workflows/lessons-canonical-ci.yml`)
- Runs data/content checks and seed validation
- Runs targeted Playwright spec:
  - `pnpm -C apps/client exec playwright test e2e/lessons-canonical-runtime.spec.ts --project=chromium --reporter=line`
- Focus: canonical lessons runtime regression gate.

### Server rejoin regression (`.github/workflows/server-rejoin-regression.yml`)
- Runs `pnpm verify:churn:pr`
- Runs `pnpm test:server:rejoin`
- Focus: server multiplayer/rejoin regression coverage.

### Headless multiplayer harness (`.github/workflows/headless-harness.yml`)
- Runs `pnpm harness:headless`
- Focus: deterministic headless multiplayer behavior checks.

### Contract-first (`.github/workflows/contract-first.yml`)
- Runs `pnpm sdk:gen`
- Runs `pnpm verify`
- Focus: API contract and SDK drift prevention, with verification checks.

## Future CI Proposal

### Proposal goals
- Make test intent clearer (fast PR checks vs deeper nightly checks).
- Reduce overlap and improve signal when failures happen.
- Standardize command naming so CI and local workflows match.

### Proposed lanes
- **PR fast lane (required):**
  - `test:run` (Vitest once)
  - `e2e:auth-guard` (multi-spec smoke for auth surfaces)
  - `e2e:stack:ci` (core gameplay path)
- **PR domain lanes (path-filtered):**
  - lessons changes -> `e2e:lessons:canonical`
  - multiplayer/engine changes -> churn/rejoin harness
- **Nightly/full lane:**
  - full client `e2e`
  - headless harness
  - server regression suite

### Proposed script additions (client)
- `e2e:smoke` -> compose fast, high-signal scenarios
- `e2e:critical` -> include auth + stack + churn paths
- `test:ci` -> canonical CI entry for client unit tests (`vitest run`)

### Naming/maintenance recommendation
- Keep scenario scripts as explicit single-purpose commands.
- Keep one or two composed multi-test commands (`e2e:smoke`, `e2e:critical`) for CI ergonomics.
- Ensure every CI workflow calls named scripts instead of long inline commands where possible.
