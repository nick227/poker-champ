import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { nanoid } from "nanoid";
import { getPrisma } from "@poker-champ/db";
import { createTestUser, cleanupTestUsers } from "../../../__tests__/testUtils.js";

const { matchMakerMock } = vi.hoisted(() => ({
  matchMakerMock: {
    query: vi.fn<(...args: any[]) => Promise<any>>(async () => []),
    remoteRoomCall: vi.fn<(...args: any[]) => Promise<any>>(async () => undefined),
  },
}));

vi.mock("@colyseus/core", () => ({
  matchMaker: matchMakerMock,
}));

const { reconcileAbandonedBalancesMock } = vi.hoisted(() => ({
  reconcileAbandonedBalancesMock: vi.fn(async () => ({ successCount: 1, failCount: 0 })),
}));

vi.mock("../../recovery/RecoveryService.js", () => ({
  RecoveryService: {
    reconcileAbandonedBalances: reconcileAbandonedBalancesMock,
  },
}));

import { AdminService } from "../AdminService.js";

describe("AdminService admin audit logging", () => {
  const prisma = getPrisma();

  beforeEach(() => {
    matchMakerMock.query.mockReset();
    matchMakerMock.query.mockResolvedValue([]);
    matchMakerMock.remoteRoomCall.mockReset();
    matchMakerMock.remoteRoomCall.mockResolvedValue(undefined);
    reconcileAbandonedBalancesMock.mockClear();
  });

  const createdActorIds: string[] = [];

  afterAll(async () => {
    // AdminLog.actorUserId is a restricting FK (audit rows must outlive the
    // actor's user record in general); tests need to clear their own log
    // rows before cleanupTestUsers() can delete the underlying test users.
    if (createdActorIds.length > 0) {
      await prisma.adminLog.deleteMany({ where: { actorUserId: { in: createdActorIds } } });
    }
    await cleanupTestUsers();
  });

  async function makeAdmin(prefix: string) {
    const user = await createTestUser(`${prefix}-${nanoid(6)}`);
    await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
    createdActorIds.push(user.id);
    return user;
  }

  async function logsFor(targetUserId: string) {
    return prisma.adminLog.findMany({
      where: { targetUserId },
      orderBy: { createdAt: "desc" },
    });
  }

  it("banUser writes a BAN AdminLog row with correct actor/target/before/after", async () => {
    const admin = await makeAdmin("admin-ban");
    const target = await createTestUser(`target-ban-${nanoid(6)}`);

    const updated = await AdminService.banUser(target.id, admin.id, "abuse report");

    expect(updated.isBanned).toBe(true);

    const logs = await logsFor(target.id);
    expect(logs).toHaveLength(1);
    expect(logs[0].actorUserId).toBe(admin.id);
    expect(logs[0].action).toBe("BAN");
    expect(logs[0].targetUserId).toBe(target.id);
    expect(logs[0].reason).toBe("abuse report");
    expect(logs[0].beforeJson).toMatchObject({ isBanned: false });
    expect(logs[0].afterJson).toMatchObject({ isBanned: true });
  });

  it("unbanUser writes an UNBAN AdminLog row with correct before/after", async () => {
    const admin = await makeAdmin("admin-unban");
    const target = await createTestUser(`target-unban-${nanoid(6)}`);
    await AdminService.banUser(target.id, admin.id);

    const updated = await AdminService.unbanUser(target.id, admin.id, "appeal granted");

    expect(updated.isBanned).toBe(false);

    const logs = await logsFor(target.id);
    const unbanLog = logs.find((l) => l.action === "UNBAN");
    expect(unbanLog).toBeTruthy();
    expect(unbanLog!.actorUserId).toBe(admin.id);
    expect(unbanLog!.beforeJson).toMatchObject({ isBanned: true });
    expect(unbanLog!.afterJson).toMatchObject({ isBanned: false });
  });

  it("promoteUserToAdmin writes a PROMOTE AdminLog row with correct before/after role", async () => {
    const admin = await makeAdmin("admin-promote");
    const target = await createTestUser(`target-promote-${nanoid(6)}`);

    const updated = await AdminService.promoteUserToAdmin(target.id, admin.id);

    expect(updated.role).toBe("ADMIN");

    const logs = await logsFor(target.id);
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe("PROMOTE");
    expect(logs[0].actorUserId).toBe(admin.id);
    expect(logs[0].beforeJson).toMatchObject({ role: "USER" });
    expect(logs[0].afterJson).toMatchObject({ role: "ADMIN" });
  });

  it("setRole writes a ROLE_CHANGE AdminLog row with correct before/after role", async () => {
    const admin = await makeAdmin("admin-role");
    const target = await createTestUser(`target-role-${nanoid(6)}`);

    const updated = await AdminService.setRole(target.id, "MODERATOR", admin.id, "trusted mod");

    expect(updated.role).toBe("MODERATOR");

    const logs = await logsFor(target.id);
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe("ROLE_CHANGE");
    expect(logs[0].reason).toBe("trusted mod");
    expect(logs[0].beforeJson).toMatchObject({ role: "USER" });
    expect(logs[0].afterJson).toMatchObject({ role: "MODERATOR" });
  });

  it("softDeleteUser and restoreUser write SOFT_DELETE / RESTORE AdminLog rows", async () => {
    const admin = await makeAdmin("admin-delete");
    const target = await createTestUser(`target-delete-${nanoid(6)}`);

    const deleted = await AdminService.softDeleteUser(target.id, admin.id);
    expect(deleted.deletedAt).not.toBeNull();

    const restored = await AdminService.restoreUser(target.id, admin.id);
    expect(restored.deletedAt).toBeNull();

    const logs = await logsFor(target.id);
    const deleteLog = logs.find((l) => l.action === "SOFT_DELETE");
    const restoreLog = logs.find((l) => l.action === "RESTORE");
    expect(deleteLog).toBeTruthy();
    expect(deleteLog!.beforeJson).toMatchObject({ deletedAt: null });
    expect((deleteLog!.afterJson as any)?.deletedAt).not.toBeNull();
    expect(restoreLog).toBeTruthy();
    expect((restoreLog!.beforeJson as any)?.deletedAt).not.toBeNull();
    expect(restoreLog!.afterJson).toMatchObject({ deletedAt: null });
  });

  it("createAdminUser writes a CREATE_ADMIN_USER AdminLog row", async () => {
    const admin = await makeAdmin("admin-create");
    const email = `new-admin-${nanoid(6)}@test.com`;

    const created = await AdminService.createAdminUser(
      { email, password: "supersecret123" },
      admin.id,
      "bootstrap second admin",
    );

    expect(created.role).toBe("ADMIN");

    const logs = await logsFor(created.id);
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe("CREATE_ADMIN_USER");
    expect(logs[0].actorUserId).toBe(admin.id);
    expect(logs[0].beforeJson).toMatchObject({ role: "USER" });
    expect(logs[0].afterJson).toMatchObject({ role: "ADMIN" });

    await prisma.user.delete({ where: { id: created.id } }).catch(() => {});
  });

  it("a BAN whose log write fails (bogus actor FK) throws and rolls back the action", async () => {
    const target = await createTestUser(`target-fk-fail-${nanoid(6)}`);
    const bogusActorId = `nonexistent-actor-${nanoid(8)}`;

    await expect(AdminService.banUser(target.id, bogusActorId)).rejects.toThrow();

    const reloaded = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(reloaded.isBanned).toBe(false);

    const logs = await logsFor(target.id);
    expect(logs).toHaveLength(0);
  });

  it("runBalanceRecovery writes a BALANCE_RECOVERY AdminLog row", async () => {
    const admin = await makeAdmin("admin-recovery");

    const result = await AdminService.runBalanceRecovery(2 * 60 * 60 * 1000, admin.id, "manual sweep");

    expect(reconcileAbandonedBalancesMock).toHaveBeenCalledWith(2 * 60 * 60 * 1000);
    expect(result).toEqual({ successCount: 1, failCount: 0 });

    const logs = await prisma.adminLog.findMany({
      where: { actorUserId: admin.id, action: "BALANCE_RECOVERY" },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].targetUserId).toBeNull();
    expect(logs[0].reason).toBe("manual sweep");
    expect(logs[0].afterJson).toMatchObject({ successCount: 1, failCount: 0 });
  });

  it("kickUserFromTable calls the room RPC and writes a TABLE_KICK AdminLog row", async () => {
    const admin = await makeAdmin("admin-kick");
    const target = await createTestUser(`target-kick-${nanoid(6)}`);
    matchMakerMock.query.mockResolvedValue([{ roomId: "room_abc", metadata: { tableId: "table_abc" } }]);

    const result = await AdminService.kickUserFromTable("room_abc", target.id, admin.id, "disruptive");

    expect(result).toEqual({ ok: true, roomId: "room_abc", targetUserId: target.id });
    expect(matchMakerMock.remoteRoomCall).toHaveBeenCalledWith(
      "room_abc",
      "kickUserByAdmin",
      [target.id, "disruptive"],
      5000,
    );

    const logs = await prisma.adminLog.findMany({
      where: { actorUserId: admin.id, action: "TABLE_KICK", targetTableId: "room_abc" },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].targetUserId).toBe(target.id);
    expect(logs[0].reason).toBe("disruptive");
  });

  it("kickUserFromTable throws ROOM_NOT_FOUND when the table doesn't exist", async () => {
    const admin = await makeAdmin("admin-kick-404");
    const target = await createTestUser(`target-kick-404-${nanoid(6)}`);
    matchMakerMock.query.mockResolvedValue([]);

    await expect(AdminService.kickUserFromTable("missing_room", target.id, admin.id)).rejects.toMatchObject({
      code: "ROOM_NOT_FOUND",
    });
  });

  it("closeTable kicks all human players via the room RPC and writes a TABLE_CLOSE AdminLog row", async () => {
    const admin = await makeAdmin("admin-close");
    matchMakerMock.query.mockResolvedValue([{ roomId: "room_close_1", metadata: { tableId: "table_close_1" } }]);
    matchMakerMock.remoteRoomCall.mockResolvedValue({ kickedUserIds: ["u1", "u2"] });

    const result = await AdminService.closeTable("room_close_1", admin.id, "table shutdown");

    expect(result).toEqual({ ok: true, roomId: "room_close_1", kickedUserIds: ["u1", "u2"] });
    expect(matchMakerMock.remoteRoomCall).toHaveBeenCalledWith(
      "room_close_1",
      "closeTableByAdmin",
      ["table shutdown"],
      10_000,
    );

    const logs = await prisma.adminLog.findMany({
      where: { actorUserId: admin.id, action: "TABLE_CLOSE", targetTableId: "room_close_1" },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].afterJson).toMatchObject({ kickedUserIds: ["u1", "u2"] });
  });

  it("closeTable's log write failure (bogus actor FK) throws even though the room was already closed", async () => {
    matchMakerMock.query.mockResolvedValue([{ roomId: "room_close_fail", metadata: {} }]);
    matchMakerMock.remoteRoomCall.mockResolvedValue({ kickedUserIds: ["u9"] });
    const bogusActorId = `nonexistent-actor-${nanoid(8)}`;

    await expect(AdminService.closeTable("room_close_fail", bogusActorId)).rejects.toThrow();

    // The room-level action already ran (it isn't transactional with the log write) -
    // the important assertion is that the failure is NOT silently swallowed: the
    // caller sees an error rather than a clean success with no audit trace.
    expect(matchMakerMock.remoteRoomCall).toHaveBeenCalledWith(
      "room_close_fail",
      "closeTableByAdmin",
      ["ADMIN_CLOSED"],
      10_000,
    );
    const logs = await prisma.adminLog.findMany({ where: { targetTableId: "room_close_fail" } });
    expect(logs).toHaveLength(0);
  });
});
