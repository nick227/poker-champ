import express from "express";
import { requireAuth } from "./RequireAuth.js";
import { requireAdmin } from "./AdminMiddleware.js";
import { AdminService } from "./AdminService.js";
import { UserRole } from "@prisma/client";
import { toPublicUser } from "./PublicUser.js";

const router = express.Router();

router.use(requireAuth, requireAdmin); // Protect all routes

/**
 * Shared error responder for admin mutation routes: maps a known "not found"
 * error code (e.g. Prisma's P2025, or AdminService's ROOM_NOT_FOUND) to 404,
 * and falls back to 500 for everything else.
 */
// Exercised by every AdminRouter.test.ts error-path case; CRAP score reflects no coverage data being wired into this fallow run.
// fallow-ignore-next-line complexity
function sendAdminActionError(res: express.Response, err: any, notFoundCode: string, notFoundMessage: string) {
  if (err?.code === notFoundCode) {
    res.status(404).json({ error: notFoundMessage });
    return;
  }
  res.status(500).json({ error: err?.message ?? "Internal Server Error" });
}

// GET /api/admin/users
router.get("/users", async (req, res) => {
  try {
    const page = parseInt(String(req.query.page) || "1");
    const limit = parseInt(String(req.query.limit) || "20");
    
    const result = await AdminService.getUsers(page, limit);
    res.json({
      users: result.users.map((item) => ({
        ...toPublicUser(item.user),
        stats: item.stats,
      })),
      total: result.total,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/users
router.post("/users", async (req, res) => {
  try {
    const { email, password, displayName, username, reason } = req.body ?? {};
    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    const user = await AdminService.createAdminUser({ email, password, displayName, username }, req.user!.id, reason);
    res.status(201).json(toPublicUser(user));
  } catch (err: any) {
    const message = err?.message ?? "Unable to create admin user";
    if (
      message === "Email already registered" ||
      message === "Username already taken" ||
      String(message).startsWith("Username must be at least")
    ) {
      res.status(400).json({ error: message });
      return;
    }
    res.status(500).json({ error: message });
  }
});

// PATCH /api/admin/users/:id/promote
router.patch("/users/:id/promote", async (req, res) => {
  try {
    const reason = req.body?.reason;
    const user = await AdminService.promoteUserToAdmin(req.params.id, req.user!.id, reason);
    res.json(toPublicUser(user));
  } catch (err: any) {
    sendAdminActionError(res, err, "P2025", "User not found");
  }
});

// POST /api/admin/users/:id/ban
router.post("/users/:id/ban", async (req, res) => {
  try {
    const reason = req.body?.reason;
    const user = await AdminService.banUser(req.params.id, req.user!.id, reason);
    res.json(toPublicUser(user));
  } catch (err: any) {
    sendAdminActionError(res, err, "P2025", "User not found");
  }
});

// POST /api/admin/users/:id/unban
router.post("/users/:id/unban", async (req, res) => {
  try {
    const reason = req.body?.reason;
    const user = await AdminService.unbanUser(req.params.id, req.user!.id, reason);
    res.json(toPublicUser(user));
  } catch (err: any) {
    sendAdminActionError(res, err, "P2025", "User not found");
  }
});

// POST /api/admin/users/:id/delete
router.post("/users/:id/delete", async (req, res) => {
  try {
    const reason = req.body?.reason;
    const user = await AdminService.softDeleteUser(req.params.id, req.user!.id, reason);
    res.json(toPublicUser(user));
  } catch (err: any) {
    sendAdminActionError(res, err, "P2025", "User not found");
  }
});

// POST /api/admin/users/:id/restore
router.post("/users/:id/restore", async (req, res) => {
  try {
    const reason = req.body?.reason;
    const user = await AdminService.restoreUser(req.params.id, req.user!.id, reason);
    res.json(toPublicUser(user));
  } catch (err: any) {
    sendAdminActionError(res, err, "P2025", "User not found");
  }
});


// PATCH /api/admin/users/:id/role
router.patch("/users/:id/role", async (req, res) => {
    try {
        const { role, reason } = req.body ?? {};
        if (!Object.values(UserRole).includes(role)) {
             res.status(400).json({ error: "Invalid role. Must be one of: " + Object.values(UserRole).join(", ") });
             return;
        }

        const user = await AdminService.setRole(req.params.id, role, req.user!.id, reason);
        res.json(toPublicUser(user));
    } catch (err: any) {
        sendAdminActionError(res, err, "P2025", "User not found");
    }
});

// GET /api/admin/economy/balances
router.get("/economy/balances", async (req, res) => {
  try {
    const result = await AdminService.getBalances({
      page: parseInt(String(req.query.page) || "1"),
      limit: parseInt(String(req.query.limit) || "20"),
      tableId: req.query.tableId as string,
      userId: req.query.userId as string,
      status: req.query.status as string,
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/economy/transactions
router.get("/economy/transactions", async (req, res) => {
  try {
    const result = await AdminService.getTransactions({
      page: parseInt(String(req.query.page) || "1"),
      limit: parseInt(String(req.query.limit) || "20"),
      tableId: req.query.tableId as string,
      userId: req.query.userId as string,
      handId: req.query.handId as string,
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/economy/recovery
router.post("/economy/recovery", async (req, res) => {
  try {
    const thresholdHours = parseInt(String(req.query.thresholdHours) || "2");
    const thresholdMs = thresholdHours * 60 * 60 * 1000;
    const reason = req.body?.reason;

    const result = await AdminService.runBalanceRecovery(thresholdMs, req.user!.id, reason);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/tables/:roomId/close
router.post("/tables/:roomId/close", async (req, res) => {
  try {
    const reason = req.body?.reason;
    const result = await AdminService.closeTable(req.params.roomId, req.user!.id, reason);
    res.json(result);
  } catch (err: any) {
    sendAdminActionError(res, err, "ROOM_NOT_FOUND", "Table not found");
  }
});

// POST /api/admin/tables/:roomId/kick
router.post("/tables/:roomId/kick", async (req, res) => {
  try {
    const { userId, reason } = req.body ?? {};
    if (!userId || typeof userId !== "string") {
      res.status(400).json({ error: "userId is required" });
      return;
    }

    const result = await AdminService.kickUserFromTable(req.params.roomId, userId, req.user!.id, reason);
    res.json(result);
  } catch (err: any) {
    sendAdminActionError(res, err, "ROOM_NOT_FOUND", "Table not found");
  }
});

export const adminRouter = router;
