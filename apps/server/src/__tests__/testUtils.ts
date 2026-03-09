import { getPrisma } from "../db/prisma.js";
import { AuthService } from "../engine/auth/AuthService.js";
import bcrypt from "bcryptjs";

const prisma = getPrisma();
const testUsers: any[] = [];

export async function createTestUser(username: string, bankrollCents: number = 1000000) {
  const password = "testpassword123";
  const hashedPassword = await bcrypt.hash(password, 10);
  const email = `${username}@test.com`;
  const displayName = username;
  
  const user = await prisma.user.create({
    data: {
      email,
      username,
      displayName,
      passwordHash: hashedPassword,
      bankrollCents,
    },
  });
  
  testUsers.push(user.id);
  return user;
}

export async function createAuthToken(userId: string) {
  // Use the private createSession method via reflection or create a session manually
  const token = await (AuthService as any).createSession(userId);
  return token;
}

export async function cleanupTestUsers() {
  if (testUsers.length === 0) return;
  
  await prisma.user.deleteMany({
    where: {
      id: {
        in: testUsers,
      },
    },
  });
  
  testUsers.length = 0;
}
