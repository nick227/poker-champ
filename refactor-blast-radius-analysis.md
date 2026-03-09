# Blast Radius & Risk Analysis

Moving a large `src/` directory to `apps/server/src/`, flattening core domains, and co-locating tests are highly destructive operations at the file-system level. Even with tools like codemods, there is a massive "blast radius" that could severely impact the team's velocity and production stability if not carefully mitigated.

Here is a breakdown of the unintended blast radius and operational risks:

## 1. The "In-Flight PR" Collision (Merge Hell)
**The Risk:** Any feature branch that is currently open when the folder structure migration lands will face catastrophic merge conflicts. Git tracks renames heuristics, but moving a file *and* actively modifying it in a feature branch often results in Git treating it as a "deleted file" in one branch and a "new file" in another.
**Mitigation:** 
- **Code Freeze:** Announce a strict feature freeze 48-72 hours before Phase 1. 
- **Clear the Queue:** Force all in-flight PRs to be merged or explicitly paused. 
- **Rebase Training:** Provide the team with exact `git rebase` instructions for how to recover branches that were left behind.

## 2. CI/CD Pipeline Breakages
**The Risk:** Moving `src/` to `apps/server/` will break every script that expects the backend to be at the root.
- Dockerfiles: Copying `./src` to `/app/src` will fail.
- GitHub Actions / CI Workflows: Commands like `cd src && npm test` or path-based CI triggers (e.g., `on: push: paths: ['src/**']`) will silently ignore the new `apps/server/` paths or crash.
- Deployment Environments: PaaS providers (Heroku, Vercel, Railway, Render) often have a "Root Directory" setting that will urgently need to be updated.
**Mitigation:** 
- Update `docker-compose.yml`, `Dockerfile`, and CI workflow files *in the same PR* as the folder move.
- Coordinate with DevOps to update the "Root Directory" in staging/production environments immediately upon merge.

## 3. Tooling & Configuration Blindspots
**The Risk:** Deeply entrenched configurations often rely on relative paths or regexes that will break:
- **TypeScript References:** `tsconfig.json` `paths` and `references` will point to the void.
- **Test Runners:** `vitest.config.ts`, `jest.config.js`, or coverage thresholds might be hardcoded to `src/tests/` and will fail to find tests or report 0% coverage when tests are co-located.
- **Linting:** `.eslintignore`, `.prettierignore`, and ESLint `overrides` bound to specific folders will stop running, allowing bad code to silently slide into `main`.
- **Nodemon / Watchers:** Development hot-reloading watchers might stop observing the new paths.
**Mitigation:**
- Run a global regex search for `src/` inside the config files (`*.json`, `*.js`, `*.config.*`, `.github/workflows/`) prior to the move.

## 4. The `require`/`fs.readFileSync` Runtime Crash (Hidden Dependencies)
**The Risk:** Codemods and TypeScript are excellent at rewriting `import` and `export` statements, but they absolutely **fail** to rewrite:
- Dynamic imports: `await import(``./services/${moduleName}``)`
- File system reads: `fs.readFileSync(path.join(__dirname, '../../content/config.json'))`
- Environment variables containing paths.
If the backend relies on reading static `.json` files, templates, or certificates from the file system, moving the source file deeper into `apps/server/src/` changes the relative resolution of `__dirname` or `process.cwd()`. The app will compile fine but crash at runtime.
**Mitigation:**
- Audit the codebase for `fs.mjs`, `path.resolve`, `__dirname`, and `process.cwd()`.
- Ensure all file-system lookups are relative to the project root, not the file location, or update the relative paths manually.

## 5. Loss of Git History / git blame
**The Risk:** If developers manually move files or if files are moved and heavily modified in the same commit, `git blame` will reset. The file history will appear as if the file was created on the day of the refactor, losing years of valuable context about *why* a line of code exists.
**Mitigation:**
- Perform all `mv` commands via Git (`git mv`). 
- **Never modify code logic in the same commit as a file move.** Move the files, commit. Modify the imports, commit. 

## 6. Docker Build Caching Invalidation
**The Risk:** If the project uses localized Docker builds, moving the `src/` to `apps/server/` might alter how the `.dockerignore` processes files or how layer caching operates. If the entire monorepo is now sent to the Docker daemon for the backend build instead of just `src/`, build times could skyrocket.
**Mitigation:** 
- Test Docker builds locally with `docker build --no-cache` and verify the build context size doesn't artificially inflate. Use a workspace-aware Docker approach (like turbo-repo's pruned builds).

## 7. Psychological Blast Radius
**The Risk:** Moving the cheese. Developers who are intimately familiar with `src/engine/dealer/services/` will suddenly be lost. This slows down velocity for 1-2 weeks as muscle memory is rewritten.
**Mitigation:**
- Do not surprise the team. Present the ADR, give them a week to digest it, and hold a 15-minute walkthrough of the new architecture immediately after the merge.
