# Client Build Pipeline: Hardening, Optimization & Finalization Proposal

**Scope:** `apps/client` — builds for **web**, **mobile** (Android/iOS), and **desktop** (Tauri).  
**Goal:** A single, industrial-grade, maximally optimized pipeline with shared safeguards, SDK/contract alignment, and platform-specific enhancements.

---

## Phased Process (Implementation Order)

### Phase 0 — Lock the “release contract” for client builds

**Outcome:** Any build artifact (web/desktop/mobile) is guaranteed to match server + contracts.

**Rules:**

- Client build must **fail fast** if:
  - realtime-contract isn’t built / typecheck clean
  - SDK is out of date vs OpenAPI (or whatever is treated as “truth”)
  - client typecheck / lint / tests fail
- Builds must run with a **declared env matrix** (no “mystery .env on someone’s machine”).

**Deliverable:** A single build entrypoint script + CI job that uses it.

### Phase 1 — Single build entrypoint (“one button”)

**Outcome:** One command can produce: web bundle → desktop bundle (from web) → optionally kick off EAS builds or instruct the workflow.

**Shape:**

1. **Preflight** (blocking)
2. **build:web**
3. **build:desktop** (depends on web output)
4. **Mobile:** stays in EAS; same preflight must run before any release build is allowed to ship.

### Phase 2 — Preflight as source of truth

**Outcome:** Every target shares the same gates. Reusable command: **`pnpm preflight:client`**.

**Preflight (blocking):**

- realtime-contract build/typecheck
- sdk:check (or sdk:gen for release builds)
- apps/client typecheck
- apps/client lint
- apps/client unit tests + money-safety

**Optional (CI / pre-release):** web e2e stack.

### Phase 3 — Optimize deliberately

**Outcome:** Prove bundle size + perf changes, not just hope.

- **Do now (low risk):** Explicit Metro minifier config for production-only; `drop_console` (keep warn/error, drop log/info); source map policy (on for CI artifacts, off for public deploy unless uploading to Sentry etc.).
- **Measurement:** On-demand/weekly bundle analysis job (Atlas or alternative); optional size gate (warn first, then fail once stable).

### Phase 4 — Platform-specific finish lines

- **Web:** PWA now or later (product choice); deployment conventions (artifact zip naming, hosting, cache headers).
- **Desktop (Tauri):** Single-source version (derive Tauri from app version); updater/signing strategy (document + placeholders).
- **Mobile (EAS):** Finalize production profile env + submission checklist; on-demand CI workflow for EAS preview builds (not every PR unless desired).

---

## Hard choices (decide early)

| Decision | Recommendation |
|----------|----------------|
| **SDK step** | `sdk:check` for normal PRs (fast); `sdk:gen` required for release branches/tags (strict). |
| **E2E in main gate** | Keep out until stable + fast; then blocking for release builds first, then maybe main. |
| **Source maps** | CI artifacts: yes. Public deploy: depends on error tracking (e.g. Sentry). |
| **Console dropping** | Drop `log`/`info` in prod; keep `warn`/`error`. |
| **When to build desktop** | **PR = web only.** Main/release/tags = web + desktop. Mobile = manual/on-demand. |

---

## What to implement first (minimal, high impact)

1. **`pnpm preflight:client`** — blocking gates (realtime-contract, sdk:check, client typecheck, lint, unit tests, money-safety).
2. **`pnpm preflight:client:ci`** — alias for CI; evolve CI-only checks later (stricter lint, snapshot consistency) without touching dev.
3. **`scripts/build-all.mjs`** — preflight → env assertion → web → desktop; build-mode banner (WEB ONLY, NODE_ENV); `--web-only` for PRs.
4. **Env assertion** — before `build:web`, fail if `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WS_URL`, `EXPO_PUBLIC_COLYSEUS_URL` missing.
5. **CI:** Blocking preflight + web; desktop gated by branch (PR = web only; main/schedule/manual = web + desktop); artifact uploads; env matrix.
6. **Metro:** Production minifier config (Terser) with `drop_console: ['log','info']`.

---

## 1. Current State Summary

### 1.1 Build Targets

| Target   | Command / Flow | Output / Artifact |
|----------|----------------|-------------------|
| **Web**  | `sync-tokens-web.cjs` → `expo export --platform web` | `dist/` (Metro bundle + assets) |
| **Desktop** | `build:web` then `tauri build` | Tauri uses `distDir: "../../dist"` (web output); native binary in Tauri target dir |
| **Android** | `eas build --platform android --profile preview` | EAS artifact (APK; preview = internal) |
| **iOS**   | `eas build --platform ios --profile preview` | EAS artifact (simulator in preview) |

### 1.2 Key Dependencies

- **Bundler:** Expo + Metro (web bundler: Metro).
- **Client SDK:** `@poker-champ/sdk` (workspace, TypeScript source); runtime version check in `bootstrap/sdk.ts`.
- **Realtime contract:** `@poker-champ/realtime-contract` (workspace, built to `dist/`); shared with server; used for types and guards.
- **Config:** `app.config.ts` (Expo), `metro.config.cjs` (with NativeWind), `babel.config.cjs`, `tauri/tauri.conf.json`, `eas.json`.

### 1.3 Testing & Safeguards

- **Unit:** Vitest (`src/tests/**/*.test.ts`), `test:run`, `test:voice`, `test:client:money-safety`.
- **E2E:** Playwright (`e2e/`), web only; `e2e:stack`, `e2e:stack:ci` for CI.
- **Root `verify`:** `sdk:check` → client tests → server core → soak → `realtime:check` → harness → `ui:no-fetch` → knip → madge. **Does not** run client e2e.
- **Root `verify:ci`:** `verify` + `test:client:e2e:stack:ci`.
- **CI:** `contract-first.yml` runs `sdk:gen` + `verify` on API/client/sdk path changes; `client-build-smoke.yml` runs web + desktop build with `continue-on-error: true` (non-blocking).

### 1.4 Gaps Identified

1. **No unified pipeline:** Web, desktop, and mobile are separate commands; no single “build all” with per-target env.
2. **Optimization not explicit:** Metro uses default Terser; no `drop_console`, no bundle analysis in CI, no comparison with esbuild/Closure.
3. **SDK/contract not baked into client build:** No mandatory `realtime-contract` build or SDK version pin before client build; version mismatch is runtime-only.
4. **Smoke tests are best-effort:** Client build smoke does not fail the workflow; no mobile build in CI.
5. **Platform-specific features:** No PWA/service worker for web; no explicit desktop updater/signing story; EAS production env is placeholder.
6. **Reproducibility:** No documented env matrix, artifact naming, or source-map policy.

---

## 2. Proposed Industrial Pipeline

### 2.1 Single Pipeline Shape

- **One entry script** (e.g. `scripts/build-all.mjs` or root `build:client:*` orchestration) that:
  - Installs deps (or assumes `pnpm install` already run).
  - Builds `@poker-champ/realtime-contract` and ensures `@poker-champ/sdk` is typecheck-clean (or built if SDK gains a build step).
  - Runs **safeguards** once: `typecheck`, `lint`, and a **minimal client test suite** (e.g. `test:run` + money-safety).
  - Builds **web** with production env.
  - Optionally builds **desktop** (depends on web).
  - Optionally triggers or documents **EAS** builds (mobile can remain in EAS dashboard or a separate workflow with same env).

- **Environment matrix:** One source of truth (e.g. `.env.production.example` or CI env vars) for:
  - `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_API_VERSION`, `EXPO_PUBLIC_WS_URL`, `EXPO_PUBLIC_COLYSEUS_URL`, `EXPO_PUBLIC_REALTIME_TRANSPORT`.
- **Artifact naming:** e.g. `client-web-<git-sha>.zip`, `client-desktop-<platform>-<version>.zip`, so CI can retain and promote builds.

### 2.2 Safeguards Before Any Build

- **Mandatory (blocking):**
  - `pnpm -C apps/client typecheck`
  - `pnpm -C apps/client lint`
  - `pnpm -C packages/realtime-contract typecheck` (or build)
  - Root `pnpm realtime:check` (contract + server + client typecheck)
  - Client unit tests: `pnpm test:client` (and optionally `test:client:money-safety`)
- **Optional / CI-only:** `pnpm test:client:e2e:stack:ci` when e2e is stable and fast enough.

### 2.3 Client SDK in the Pipeline

- **Version alignment:** Keep runtime check in `bootstrap/sdk.ts`; add a **pre-build step** in the pipeline that:
  - Runs `pnpm sdk:gen` (or at least `pnpm sdk:check`) so OpenAPI and SDK types are in sync with the server contract.
  - Optionally: fail the build if `packages/sdk/src/version.ts` (or equivalent) is not committed after API changes (contract-first already enforces this for openapi.ts → openapi.json).
- **Realtime contract:** Ensure `realtime-contract` is built before client build (root `build` already builds it; client pipeline should depend on it explicitly so `build:web` alone is safe after a clean clone).

### 2.4 Testing & Safeguards Summary

| Safeguard | When | Blocking |
|-----------|------|----------|
| Contract build + realtime:check | Before web/desktop build | Yes |
| SDK gen/check | Before build (or in contract-first only) | Proposal: yes for release builds |
| Client typecheck + lint | Before every client build | Yes |
| Client unit tests | Before every client build | Yes |
| Client e2e (stack) | CI / pre-release | Optional, then yes when stable |
| Web build smoke | CI | Proposal: **yes** (remove continue-on-error) |
| Desktop build smoke | CI | Optional or yes |
| Mobile EAS build | Separate workflow or manual | Optional in pipeline doc |

---

## 3. Optimization: Minification & Bundle Size

### 3.1 Current Stack

- **Metro** (Expo) uses **Terser** by default (`metro-minify-terser`) for production `expo export` and EAS builds. No custom minifier config in `metro.config.cjs` today.

### 3.2 Options for Industrial Max Optimization

- **Terser (current, keep as default)**  
  - **Pros:** Well supported by Metro, predictable, good compression.  
  - **Enhancements:** In `metro.config.cjs`, set `transformer.minifierPath` to `metro-minify-terser` and `transformer.minifierConfig` to:
    - `compress: { drop_console: true }` for production (or `drop_console: ['log', 'info']` to keep `warn`/`error`).
    - Tune `mangle` and `format` as needed (e.g. `safari10: true` if targeting older Safari).
  - **Risk:** Low; only add options that don’t break React Native / Expo.

- **esbuild minifier**  
  - **Pros:** Much faster (useful for CI and local prod builds); often “good enough” size.  
  - **Implementation:** `metro-minify-esbuild`; swap in Metro config.  
  - **Cons:** Slightly larger bundles than Terser in some benchmarks; ensure React Native / Expo compatibility.

- **Google Closure Compiler**  
  - **Pros:** ADVANCED mode can yield smaller bundles and dead-code removal.  
  - **Cons:** Requires careful setup with Metro/Expo; risk of breaking code that relies on property names or reflection; build time and configuration overhead.  
  - **Recommendation:** Treat as **optional / experimental**; only consider if bundle size is critical and Terser/esbuild are insufficient; run in a separate pipeline variant with full regression tests.

### 3.3 Recommended Default

- **Keep Terser** as the default minifier.
- **Add explicit Metro minifier config** for production:
  - `drop_console: true` (or allowlist) for production.
  - Document in this proposal that future experiments (esbuild, Closure) can be toggled via env or a Metro profile.

### 3.4 Bundle Analysis

- Run **Expo Atlas** (or equivalent) periodically: `EXPO_ATLAS=true pnpm build:web` and store artifacts for inspection.
- Add a **CI job** (e.g. weekly or on demand) that:
  - Builds web with bundle analysis.
  - Fails or warns if main bundle size increases above a threshold (e.g. vs baseline committed in repo).

---

## 4. Platform-Specific Enhancements

### 4.1 Web

- **PWA / Service worker:** Consider adding a service worker for offline shell and caching (e.g. Expo’s PWA support or custom Workbox) to modernize web and improve perceived performance.
- **Asset optimization:** Ensure images/assets are optimized (Expo/Metro defaults); document any use of CDN or image resizing for production.
- **Env:** All `EXPO_PUBLIC_*` set from single source in CI and deploy (e.g. Railway); no hardcoded dev URLs in production build.

### 4.2 Desktop (Tauri)

- **Source of truth for web bundle:** Keep `distDir: "../../dist"` so desktop always packages the same web build as deployed web (single build artifact for web + desktop content).
- **Updater / signing:** Document or add Tauri updater and code-signing for production installers; consider CI step to produce signed artifacts.
- **Version:** Keep `tauri.conf.json` `package.version` in sync with `app.config.ts` (or derive from one place).

### 4.3 Mobile (EAS)

- **Profiles:** Keep `preview` (internal/simulator); finalize `production` env in `eas.json` (API URL, etc.) and document store-submission checklist.
- **SDK version:** Same as web: ensure SDK/contract are built and version-checked before EAS submit.
- **CI:** Optionally add a scheduled or on-demand EAS build (e.g. `eas build --platform all --profile preview`) so mobile is not left out of “build all” documentation.

---

## 5. Implementation Checklist (Concise)

- [x] **Pipeline:** Single entrypoint `scripts/build-all.mjs` (preflight → web → desktop); `pnpm build:client:all`; `--web-only` for PRs.
- [x] **Safeguards:** `pnpm preflight:client` runs realtime-contract build, sdk:check, client typecheck, lint, unit tests, money-safety; used in build-all and CI.
- [x] **SDK/contract:** Preflight requires realtime-contract build and sdk:check; runtime version check remains in bootstrap.
- [x] **Metro:** Explicit Terser config in `metro.config.cjs`: `drop_console: ['log', 'info']` (keep warn/error).
- [x] **CI:** client-build-smoke runs preflight → web → desktop (blocking); uploads artifacts `client-web-<sha>`, `client-desktop-<sha>`; Tauri/Rust setup for Linux.
- [ ] **Bundle analysis:** Add optional or periodic CI step with `EXPO_ATLAS=true` and size baseline/warning.
- [ ] **Platform:** Document PWA/service worker for web; Tauri version/updater/signing; EAS production env and optional mobile CI build.
- [x] **Docs:** This proposal is the single reference; update as further choices are implemented.

---

## 5.1 Next Logical Phase (After Pipeline is Stable)

- **A) Bundle Analysis (non-blocking):** Add manual workflow `EXPO_ATLAS=true pnpm build:web`; upload report artifact. Do not gate yet.
- **B) Version Single-Source:** Derive `app.config.ts` version and `tauri.conf.json` version from one value (script or shared file). Avoids mismatched desktop/web versions.
- **C) Optional Minifier Experiment:** Only if bundle size becomes a problem: try `metro-minify-esbuild`, compare size + perf, keep Terser as fallback. No urgency.

---

## 5.2 Architectural Assessment

The current pipeline provides:

- **Contract-first builds** — realtime-contract + sdk:check before any client build
- **Deterministic artifacts** — named by sha; env matrix prevents “mystery .env”
- **Platform parity** — same preflight gates for web, desktop, mobile release path
- **CI that actually means something** — blocking gates; desktop gated by branch
- **Documented operating model** — phased process, hard choices, next phase

This is enterprise-grade build hygiene. Most teams never reach this level.

---

## 5.3 Release Promotion Flow (Future)

When the pipeline has baked for a week of PRs, the natural next layer is:

web artifact → desktop artifact → mobile EAS build → tag → GitHub release

Design that flow on top of this foundation.

---

## 6. Libraries Reference (Optimization)

| Tool | Role | When to use |
|------|------|-------------|
| **Terser** | Minification (current default) | Default for production; add `drop_console` and options. |
| **metro-minify-terser** | Metro integration for Terser | Already in use via Expo/Metro. |
| **metro-minify-esbuild** | Faster minification | If CI speed matters more than minimal size. |
| **Google Closure Compiler** | Advanced minification / dead code | Experimental; only if bundle size is critical and tested. |
| **Expo Atlas** | Bundle analysis | Periodic or on-demand; CI size gate. |
| **source-map-explorer** | Size by file | Alternative to Atlas for SDK 50 or custom setups. |

---

## 7. Document History

- **Created:** 2026-02-21.  
- **Purpose:** Deep analysis and proposal for hardening, enhancing, and finalizing client build processes for web, mobile, and desktop with a common industrial pipeline, SDK/contract safeguards, testing, and optimization (Terser/esbuild/Closure).
