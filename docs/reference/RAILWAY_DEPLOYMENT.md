# Railway Deployment (Split Services)

Target topology:

- `https://poker-champ-web-production.up.railway.app` -> Web static bundle (`apps/client/dist`)
- `https://poker-champ-api-realtime-production.up.railway.app` -> Node API + Colyseus
- `wss://poker-champ-api-realtime-production.up.railway.app` -> Colyseus WebSocket transport

## Service A: `api-realtime`

- Service URL: `https://poker-champ-api-realtime-production.up.railway.app`
- Public networking port: `2567`
- Build command: `pnpm install --frozen-lockfile && pnpm build`
- Start command: `pnpm start` (or `pnpm start:with-seed` to run migrations, then lessons seed, then start—use this so prod has tables and lesson content on every deploy)
- One-off: If you need to run only migrations without starting the server, use Railway’s “Run command” (or a one-off job) with `pnpm db:migrate`.
- Required env:
  - `NODE_ENV=production`
  - `PORT=2567`
  - `DATABASE_URL=mysql://root:vkCfZFkpXAGdFAjsIWnhRafodkjLVLNP@mysql.railway.internal:3306/railway`
  - `CORS_ORIGINS=https://poker-champ-web-production.up.railway.app`
- Optional:
  - `LOG_LEVEL=info`
  - `SESSION_TTL_DAYS=14`
  - `COLYSEUS_LOGLEVEL=info`

## Service B: `web`

- Service URL: `https://poker-champ-web-production.up.railway.app`
- Public networking port: `3000`
- Build command: `pnpm install --frozen-lockfile && pnpm build:web`
- Start command: `pnpm start:web`
- Build-time env baked into Expo export:
  - `PORT=3000`
  - `EXPO_PUBLIC_API_URL=https://poker-champ-api-realtime-production.up.railway.app`
  - `EXPO_PUBLIC_COLYSEUS_URL=wss://poker-champ-api-realtime-production.up.railway.app`
  - `EXPO_PUBLIC_REALTIME_TRANSPORT=colyseus`
  - `EXPO_PUBLIC_ENABLE_EXPERIMENTAL_WS=false`

## Railway UI Checklist

1. Create Service A from repo, set build/start commands, set port `2567`, set required env vars.
2. Create Service B from same repo, set build/start commands, set port `3000`, set web env vars.
3. Run `pnpm db:migrate` once on Service A after first successful deploy.
4. Open `https://poker-champ-web-production.up.railway.app` and verify API + WS calls hit the API service URL.

## Migrations and lessons on deploy

**Tables:** Prisma migrations must be applied before the app (or the lessons seed) uses the DB. **The build does not run migrations.**

**Lessons:** The catalog (L01–L15) and follow-up content live in `docs/lessons/content` and are loaded by `pnpm lessons:seed:content`. The seed requires the `Lesson` and `LessonStep` tables to exist.

**Recommended:** Set the api-realtime **Start command** to:

```bash
pnpm start:with-seed
```

That runs in order: `pnpm db:migrate` (create/update tables), then `pnpm lessons:seed:content` (upsert lesson content), then `pnpm start`. So every deploy gets migrations applied and up-to-date lesson content without needing SSH or a separate migration step. If you prefer not to seed on every start, use `pnpm db:migrate && pnpm start` and run the seed occasionally via Railway “Run command” with `pnpm lessons:seed:content`.

## Notes

- Web bundle output is canonical at `apps/client/dist`.
- Static hosting is handled by `tools/static-server.js`.
- `railway.json` only defines builder. Set build/start commands per Railway service in the UI.
- No reverse proxy required for initial rollout.
- Security: rotate the database password after initial setup because it has been shared in plaintext.
