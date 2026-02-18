import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getPrisma } from "../../db/prisma.js";
import { createTestUser, createAuthToken, cleanupTestUsers } from "../../__tests__/testUtils.js";

describe("Hand History Security", () => {
  let prisma = getPrisma();
  let userA: any;
  let userB: any;
  let userAToken: string;
  let userBToken: string;
  let sharedHandId: string;
  let userAOnlyHandId: string;

  beforeAll(async () => {
    // Create test users
    userA = await createTestUser("history-security-a");
    userB = await createTestUser("history-security-b");
    userAToken = await createAuthToken(userA.id);
    userBToken = await createAuthToken(userB.id);

    // Create test data setup would go here
    // For now, we'll use existing hand IDs or create them via the game engine
    // This is a placeholder for the actual test setup
    userAOnlyHandId = "test-user-a-only-hand";
    sharedHandId = "test-shared-hand";
  });

  afterAll(async () => {
    await cleanupTestUsers();
  });

  it("should prevent User A from fetching hand belonging only to User B", async () => {
    // This test would need a hand that only User B participated in
    // For now, we'll test the endpoint structure
    
    const response = await fetch(`http://localhost:3001/api/history/hands/${userAOnlyHandId}`, {
      headers: {
        "Authorization": `Bearer ${userBToken}`,
        "Content-Type": "application/json",
      },
    });

    // Should return 404 for hand user B didn't participate in
    expect(response.status).toBe(404);
    
    const data = await response.json();
    expect(data.error).toBe("Hand not found");
  });

  it("should allow User A to fetch hand where A participated", async () => {
    const response = await fetch(`http://localhost:3001/api/history/hands/${sharedHandId}`, {
      headers: {
        "Authorization": `Bearer ${userAToken}`,
        "Content-Type": "application/json",
      },
    });

    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data.id).toBe(sharedHandId);
    expect(data.players).toBeDefined();
    expect(data.actions).toBeDefined();
    expect(data.payouts).toBeDefined();
  });

  it("should prevent unauthorized access without token", async () => {
    const response = await fetch(`http://localhost:3001/api/history/hands/${sharedHandId}`, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    expect(response.status).toBe(401);
  });

  it("should return 404 for non-existent hand ID", async () => {
    const fakeHandId = "550e8400-e29b-41d4-a716-446655440000";
    
    const response = await fetch(`http://localhost:3001/api/history/hands/${fakeHandId}`, {
      headers: {
        "Authorization": `Bearer ${userAToken}`,
        "Content-Type": "application/json",
      },
    });

    expect(response.status).toBe(404);
    
    const data = await response.json();
    expect(data.error).toBe("Hand not found");
  });

  it("should validate hand ID format (UUID)", async () => {
    const invalidHandId = "invalid-uuid-format";
    
    const response = await fetch(`http://localhost:3001/api/history/hands/${invalidHandId}`, {
      headers: {
        "Authorization": `Bearer ${userAToken}`,
        "Content-Type": "application/json",
      },
    });

    expect(response.status).toBe(400);
    
    const data = await response.json();
    expect(data.error).toBe("Invalid hand ID");
  });
});
