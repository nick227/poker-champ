import express from "express";
import { requireAdmin } from "./AdminMiddleware.js";
import { AdminService } from "./AdminService.js";
import { UserRole } from "@prisma/client";
import { RecoveryService } from "../recovery/RecoveryService.js";
import { toPublicUser } from "./PublicUser.js";

const router = express.Router();

router.use(requireAdmin); // Protect all routes

// GET /api/admin/users
router.get("/users", async (req, res) => {
  try {
    const page = parseInt(String(req.query.page) || "1");
    const limit = parseInt(String(req.query.limit) || "20");
    
    const result = await AdminService.getUsers(page, limit);
    res.json({ users: result.users.map(toPublicUser), total: result.total });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/users/:id/ban
router.post("/users/:id/ban", async (req, res) => {
  try {
    const user = await AdminService.banUser(req.params.id);
    res.json(toPublicUser(user));
  } catch (err: any) {
      if (err.code === 'P2025') { // Prisma record not found
          res.status(404).json({ error: "User not found" });
      } else {
        res.status(500).json({ error: err.message });
      }
  }
});

// POST /api/admin/users/:id/unban
router.post("/users/:id/unban", async (req, res) => {
  try {
    const user = await AdminService.unbanUser(req.params.id);
    res.json(toPublicUser(user));
  } catch (err: any) {
      if (err.code === 'P2025') {
          res.status(404).json({ error: "User not found" });
      } else {
        res.status(500).json({ error: err.message });
      }
  }
});

// POST /api/admin/users/:id/delete
router.post("/users/:id/delete", async (req, res) => {
  try {
    const user = await AdminService.softDeleteUser(req.params.id);
    res.json(toPublicUser(user));
  } catch (err: any) {
    if (err.code === "P2025") {
      res.status(404).json({ error: "User not found" });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

// POST /api/admin/users/:id/restore
router.post("/users/:id/restore", async (req, res) => {
  try {
    const user = await AdminService.restoreUser(req.params.id);
    res.json(toPublicUser(user));
  } catch (err: any) {
    if (err.code === "P2025") {
      res.status(404).json({ error: "User not found" });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});


// PATCH /api/admin/users/:id/role
router.patch("/users/:id/role", async (req, res) => {
    try {
        const { role } = req.body;
        if (!Object.values(UserRole).includes(role)) {
             res.status(400).json({ error: "Invalid role. Must be one of: " + Object.values(UserRole).join(", ") });
             return;
        }

        const user = await AdminService.setRole(req.params.id, role);
        res.json(toPublicUser(user));
    } catch (err: any) {
         if (err.code === 'P2025') {
          res.status(404).json({ error: "User not found" });
      } else {
        res.status(500).json({ error: err.message });
      }
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
    
    const result = await RecoveryService.reconcileAbandonedBalances(thresholdMs);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export const adminRouter = router;
