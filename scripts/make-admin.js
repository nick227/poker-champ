#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");

async function main() {
  const emailArg = process.argv[2];
  const email = typeof emailArg === "string" ? emailArg.trim().toLowerCase() : "";
  if (!email) {
    console.error("Usage: node scripts/make-admin.js user@email.com");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.update({
      where: { email },
      data: { role: "ADMIN" },
      select: { id: true, email: true, role: true },
    });
    console.log(`Promoted ${user.email} (${user.id}) to ${user.role}`);
  } catch (err) {
    if (err && err.code === "P2025") {
      console.error(`User not found for email: ${email}`);
      process.exit(1);
    }
    console.error("Failed to promote user:", err?.message || err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
