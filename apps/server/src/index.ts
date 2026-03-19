import "dotenv/config";
import http from "node:http";
import path from "node:path";
import { monitorEventLoopDelay } from "node:perf_hooks";
import express from "express";
import cors from "cors";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import * as OpenApiValidatorModule from "express-openapi-validator";
import { PokerRoom } from "./rooms/PokerRoom.js";
import { LobbyRoom } from "./lobby/LobbyRoom.js";
import { logger } from "./lib/logger.js";
import { authRouter } from "./engine/auth/AuthRouter.js";
import { adminRouter } from "./engine/auth/AdminRouter.js";
import { economyRouter } from "./http/EconomyRouter.js";
import { tournamentsRouter } from "./http/TournamentsRouter.js";
import { lobbyRouter } from "./http/LobbyRouter.js";
import { profileRouter } from "./http/ProfileRouter.js";
import { handHistoryRouter } from "./http/HandHistoryRouter.js";
import { leaderboardRouter } from "./http/LeaderboardRouter.js";
import { botRouter } from "./http/BotRouter.js";
import { lessonsRouter } from "./http/LessonsRouter.js";
import { awardsRouter } from "./http/AwardsRouter.js";
import { MonetizationRouter } from "./http/MonetizationRouter.js";
import { handleStripeWebhook } from "./http/webhooks/stripe.js";
import { openApiSpec } from "./http/openapi.js";
import { RecoveryService } from "./engine/recovery/RecoveryService.js";
import { recomputeLeaderboardSafely } from "./engine/persistence/LeaderboardAggregationService.js";
import { loadEnv } from "./config/env.js";
import { isLeaderboardEnabled, isLessonsV1Enabled } from "./config/features.js";
import { disconnectPrisma } from "@poker-champ/db";
import { securityHeaders } from "./http/middleware/security.js";
import { createIpRateLimit } from "./http/middleware/rateLimit.js";

const env = loadEnv();
const port = env.PORT;

function buildCorsOptions() {
  if (env.NODE_ENV !== "production") {
    return {
      origin: true,
      credentials: true,
    } as const;
  }

  const allowedOrigins = (env.CORS_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  return {
    credentials: true,
    origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("CORS origin denied"));
    },
  } as const;
}

const app = express();
app.use(securityHeaders);
app.use(cors(buildCorsOptions()));

// Stripe webhook must use raw body for signature verification (before express.json)
app.post(
  "/api/monetization/webhooks/stripe",
  express.raw({ type: "application/json" }),
  handleStripeWebhook
);

app.use(express.json({ limit: "1mb" }));

const avatarsRoot = path.resolve("var", "avatars");
app.use(
  "/avatars",
  express.static(avatarsRoot, {
    maxAge: "31536000",
    immutable: true,
  }),
);

const openApiMiddleware =
  (OpenApiValidatorModule as any)?.middleware ??
  (OpenApiValidatorModule as any)?.default?.middleware;

if (typeof openApiMiddleware !== "function") {
  throw new Error("express-openapi-validator middleware export not found.");
}

app.use(
  openApiMiddleware({
    apiSpec: openApiSpec as unknown as Record<string, unknown>,
    validateRequests: true,
    validateResponses: env.NODE_ENV !== "production",
    // Avoid double-processing multipart/form-data on avatar upload, which breaks Multer with "Unexpected end of form".
    ignorePaths: /\/api\/profile\/avatar/,
  }),
);

const authRateLimit = createIpRateLimit({
  maxRequests: 120,
  windowMs: 15 * 60 * 1000,
});
const loginRateLimit = createIpRateLimit({
  maxRequests: 40,
  windowMs: 15 * 60 * 1000,
});
const registerRateLimit = createIpRateLimit({
  maxRequests: 20,
  windowMs: 15 * 60 * 1000,
});

app.use("/api/auth/login", loginRateLimit);
app.use("/api/auth/register", registerRateLimit);
app.use("/api/auth", authRateLimit, authRouter);
app.use("/api/admin", adminRouter);
app.use("/api/economy", economyRouter);
app.use("/api/tournaments", tournamentsRouter);
app.use("/api/lobby", lobbyRouter);
app.use("/api/profile", profileRouter);
app.use("/api/me", profileRouter);
app.use("/api/history", handHistoryRouter);
app.use("/api/bots", botRouter);
if (isLeaderboardEnabled()) {
  app.use("/api/leaderboard", leaderboardRouter);
}
if (isLessonsV1Enabled()) {
  app.use("/api/lessons", lessonsRouter);
}
app.use("/api/awards", awardsRouter);
app.use("/api/monetization", MonetizationRouter);
app.get("/openapi.json", (_req, res) => {
  res.json(openApiSpec);
});

app.get("/health", (_req, res) => {
  res.send("OK");
});

app.get("/", (_req, res) => {
  res.json({
    service: "poker-champ-api",
    status: "ok",
    health: "/health",
    openapi: "/openapi.json",
  });
});

app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  void next;
  if (err?.status && Array.isArray(err?.errors)) {
    res.status(err.status).json({
      error: err.message ?? "Request validation failed",
      code: "REQUEST_VALIDATION_ERROR",
      details: err.errors,
    });
    return;
  }

  const status = Number(err?.status) || 500;
  logger.error({ err, status }, "Unhandled API error");
  res.status(status).json({ error: err?.message ?? "Internal Server Error" });
});

const server = http.createServer();

const gameServer = new Server({
  transport: new WebSocketTransport({
    server,
    pingInterval: 15_000,
    pingMaxRetries: 2,
  }),
  express: (colyseusApp) => {
    // Apply CORS to all routes served by Colyseus, including /matchmake/* endpoints.
    // The Express cors() above only covers routes forwarded to `app`; without this,
    // client.reconnect() / joinById() HTTP matchmaking calls are CORS-blocked.
    colyseusApp.use(cors(buildCorsOptions()));

    // Colyseus default routes (e.g. /matchmake/*) are registered after this callback.
    // Only forward known API paths to Express so Colyseus can handle its own endpoints.
    colyseusApp.use((req, res, next) => {
      const path = req.path ?? "";
      const isApiRoute = path === "/api" || path.startsWith("/api/");
      const isAvatarRoute = path.startsWith("/avatars/");
      if (isApiRoute || isAvatarRoute || path === "/" || path === "/health" || path === "/openapi.json") {
        app(req, res, next);
        return;
      }
      next();
    });
  },
});

gameServer.define("lobby", LobbyRoom);
gameServer.define("poker", PokerRoom);

let recoveryInterval: NodeJS.Timeout | null = null;
let leaderboardInterval: NodeJS.Timeout | null = null;
let eventLoopLagInterval: NodeJS.Timeout | null = null;
let memoryLogInterval: NodeJS.Timeout | null = null;
let shuttingDown = false;

async function shutdown(reason: string, exitCode: number = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ reason }, "Shutdown started");

  if (recoveryInterval) {
    clearInterval(recoveryInterval);
    recoveryInterval = null;
  }
  if (leaderboardInterval) {
    clearInterval(leaderboardInterval);
    leaderboardInterval = null;
  }
  if (eventLoopLagInterval) {
    clearInterval(eventLoopLagInterval);
    eventLoopLagInterval = null;
  }
  if (memoryLogInterval) {
    clearInterval(memoryLogInterval);
    memoryLogInterval = null;
  }

  try {
    await gameServer.gracefullyShutdown(false);
  } catch (err) {
    logger.error({ err }, "Failed to gracefully shutdown Colyseus");
  }

  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });

  try {
    await disconnectPrisma();
  } catch (err) {
    logger.error({ err }, "Failed to disconnect Prisma");
  }

  logger.info({ reason }, "Shutdown complete");
  process.exit(exitCode);
}

async function start() {
  await gameServer.listen(port);
  logger.info({ port, nodeEnv: env.NODE_ENV }, "Server listening (Express + Colyseus)");

  recoveryInterval = setInterval(() => {
    RecoveryService.reconcileAbandonedBalances().catch((err) => {
      logger.error({ err }, "Periodic recovery job failed");
    });
  }, 60 * 60 * 1000);

  if (isLeaderboardEnabled()) {
    void recomputeLeaderboardSafely();
    leaderboardInterval = setInterval(() => {
      void recomputeLeaderboardSafely();
    }, 60 * 60 * 1000);
  }

  const eventLoopHistogram = monitorEventLoopDelay({ resolution: 10 });
  eventLoopHistogram.enable();
  eventLoopLagInterval = setInterval(() => {
    const meanMs = eventLoopHistogram.mean / 1e6;
    if (meanMs > 50) {
      logger.warn({ eventLoopLagMs: Math.round(meanMs * 100) / 100 }, "EVENT_LOOP_LAG");
    }
  }, 5000);

  const memoryLogIntervalMs = Number(process.env.POKER_MEMORY_LOG_INTERVAL_MS ?? "");
  if (Number.isFinite(memoryLogIntervalMs) && memoryLogIntervalMs >= 1_000) {
    memoryLogInterval = setInterval(() => {
      const memory = process.memoryUsage();
      logger.info(
        {
          rssMB: Math.round(memory.rss / 1024 / 1024),
          heapUsedMB: Math.round(memory.heapUsed / 1024 / 1024),
          heapTotalMB: Math.round(memory.heapTotal / 1024 / 1024),
          externalMB: Math.round(memory.external / 1024 / 1024),
          arrayBuffersMB: Math.round(memory.arrayBuffers / 1024 / 1024),
        },
        "MEMORY_USAGE",
      );
    }, memoryLogIntervalMs);
  }
}

void start().catch((err) => {
  logger.error({ err }, "Failed to start server");
  void shutdown("startup_error", 1);
});

server.on("error", (err) => {
  logger.error({ err }, "HTTP server error");
  void shutdown("server_error", 1);
});

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});

process.once("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception");
  void shutdown("uncaught_exception", 1);
});

process.once("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled rejection");
  void shutdown("unhandled_rejection", 1);
});

