import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import http from "node:http";
import { nanoid } from "nanoid";
import { getPrisma } from "@poker-champ/db";
import { createTestUser, createAuthToken, cleanupTestUsers } from "../../../__tests__/testUtils.js";

const { adminServiceMock } = vi.hoisted(() => ({
  adminServiceMock: {
    getUsers: vi.fn(),
    createAdminUser: vi.fn(),
    promoteUserToAdmin: vi.fn(),
    banUser: vi.fn(),
    unbanUser: vi.fn(),
    softDeleteUser: vi.fn(),
    restoreUser: vi.fn(),
    setRole: vi.fn(),
    getBalances: vi.fn(),
    getTransactions: vi.fn(),
    runBalanceRecovery: vi.fn(),
    closeTable: vi.fn(),
    kickUserFromTable: vi.fn(),
  },
}));

vi.mock("../AdminService.js", () => ({
  AdminService: adminServiceMock,
}));

// This suite intentionally does NOT mock RequireAuth/AdminMiddleware: the
// "properly auth-gated" requirement means we need the real auth pipeline
// exercised end to end with real (DB-backed) users of each role.
import { adminRouter } from "../AdminRouter.js";

describe("AdminRouter", () => {
  const prisma = getPrisma();
  let server: http.Server;
  let baseUrl: string;

  let adminUserId: string;
  let adminToken: string;
  let plainUserToken: string;

  async function call(method: "GET" | "POST" | "PATCH", path: string, token: string | null, body?: unknown) {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/admin", adminRouter);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        const port = typeof addr === "object" && addr ? addr.port : 0;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    const admin = await createTestUser(`router-admin-${nanoid(6)}`);
    await prisma.user.update({ where: { id: admin.id }, data: { role: "ADMIN" } });
    adminUserId = admin.id;
    adminToken = await createAuthToken(admin.id);

    const plainUser = await createTestUser(`router-plain-${nanoid(6)}`);
    plainUserToken = await createAuthToken(plainUser.id);
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await cleanupTestUsers();
  });

  beforeEach(() => {
    Object.values(adminServiceMock).forEach((fn) => fn.mockReset());
  });

  it("rejects requests with no Authorization header with 401", async () => {
    const res = await call("GET", "/api/admin/users", null);
    expect(res.status).toBe(401);
    expect(adminServiceMock.getUsers).not.toHaveBeenCalled();
  });

  it("rejects non-admin authenticated requests with 403", async () => {
    const res = await call("GET", "/api/admin/users", plainUserToken);
    expect(res.status).toBe(403);
    expect(adminServiceMock.getUsers).not.toHaveBeenCalled();
  });

  it("allows admin requests through to the service", async () => {
    adminServiceMock.getUsers.mockResolvedValue({ users: [], total: 0 });
    const res = await call("GET", "/api/admin/users", adminToken);
    expect(res.status).toBe(200);
    expect(adminServiceMock.getUsers).toHaveBeenCalled();
  });

  it("ban route passes the acting admin's id and body reason to AdminService", async () => {
    adminServiceMock.banUser.mockResolvedValue({
      id: "target_1",
      role: "USER",
      isBanned: true,
      email: "t@test.com",
    });

    const res = await call("POST", "/api/admin/users/target_1/ban", adminToken, { reason: "abuse" });
    expect(res.status).toBe(200);
    expect(adminServiceMock.banUser).toHaveBeenCalledWith("target_1", adminUserId, "abuse");
  });

  it("role route rejects an invalid role with 400 without calling the service", async () => {
    const res = await call("PATCH", "/api/admin/users/target_1/role", adminToken, { role: "SUPERUSER" });
    expect(res.status).toBe(400);
    expect(adminServiceMock.setRole).not.toHaveBeenCalled();
  });

  describe("table routes", () => {
    it("close route is rejected for non-admin callers with 403", async () => {
      const res = await call("POST", "/api/admin/tables/room_1/close", plainUserToken, {});
      expect(res.status).toBe(403);
      expect(adminServiceMock.closeTable).not.toHaveBeenCalled();
    });

    it("close route calls AdminService.closeTable with actor id + reason", async () => {
      adminServiceMock.closeTable.mockResolvedValue({ ok: true, roomId: "room_1", kickedUserIds: ["u1"] });

      const res = await call("POST", "/api/admin/tables/room_1/close", adminToken, { reason: "shutdown" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ ok: true, roomId: "room_1", kickedUserIds: ["u1"] });
      expect(adminServiceMock.closeTable).toHaveBeenCalledWith("room_1", adminUserId, "shutdown");
    });

    it("close route maps a ROOM_NOT_FOUND service error to 404", async () => {
      const err = Object.assign(new Error("Table not found: room_missing"), { code: "ROOM_NOT_FOUND" });
      adminServiceMock.closeTable.mockRejectedValue(err);

      const res = await call("POST", "/api/admin/tables/room_missing/close", adminToken, {});
      expect(res.status).toBe(404);
    });

    it("kick route requires a userId in the body", async () => {
      const res = await call("POST", "/api/admin/tables/room_1/kick", adminToken, { reason: "spam" });
      expect(res.status).toBe(400);
      expect(adminServiceMock.kickUserFromTable).not.toHaveBeenCalled();
    });

    it("kick route calls AdminService.kickUserFromTable with actor id + target + reason", async () => {
      adminServiceMock.kickUserFromTable.mockResolvedValue({
        ok: true,
        roomId: "room_1",
        targetUserId: "target_9",
      });

      const res = await call("POST", "/api/admin/tables/room_1/kick", adminToken, {
        userId: "target_9",
        reason: "disruptive",
      });
      expect(res.status).toBe(200);
      expect(adminServiceMock.kickUserFromTable).toHaveBeenCalledWith("room_1", "target_9", adminUserId, "disruptive");
    });

    it("kick route maps a ROOM_NOT_FOUND service error to 404", async () => {
      const err = Object.assign(new Error("Table not found: room_missing"), { code: "ROOM_NOT_FOUND" });
      adminServiceMock.kickUserFromTable.mockRejectedValue(err);

      const res = await call("POST", "/api/admin/tables/room_missing/kick", adminToken, { userId: "target_9" });
      expect(res.status).toBe(404);
    });

    it("kick route is rejected for unauthenticated callers with 401", async () => {
      const res = await call("POST", "/api/admin/tables/room_1/kick", null, { userId: "target_9" });
      expect(res.status).toBe(401);
      expect(adminServiceMock.kickUserFromTable).not.toHaveBeenCalled();
    });
  });
});
