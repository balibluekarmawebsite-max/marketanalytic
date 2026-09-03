/**
 * Create or update a dashboard login. Run on the server after deploy to make
 * the first account, then to add teammates.
 *
 * Usage:
 *   npx tsx scripts/create-user.ts <email> <password> [name] [role]
 *   npm run user:create -- ota@bluekarmasecrets.com 'S0me-Str0ng-Pass' 'Ota' admin
 *
 * role is 'admin' or 'viewer' (default 'viewer'). Re-running for the same email
 * updates that user's password / name / role (handy for a password reset).
 */
import { PrismaClient } from "@prisma/client";
import { loadEnvConfig } from "@next/env";
import { hashPassword } from "../src/lib/password";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

async function main() {
  const [emailRaw, password, name, roleRaw] = process.argv.slice(2);
  if (!emailRaw || !password) {
    throw new Error("Usage: tsx scripts/create-user.ts <email> <password> [name] [role]");
  }
  const email = emailRaw.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error(`"${email}" is not a valid email.`);
  if (password.length < 8) throw new Error("Password must be at least 8 characters.");
  const role = roleRaw === "admin" ? "admin" : "viewer";
  const passwordHash = await hashPassword(password);

  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, name: name ?? undefined, role, isActive: true },
    create: { email, passwordHash, name: name ?? null, role },
  });
  console.log(`  ✓ ${user.email} (${user.role}) ready — sign in at /login`);
}

main().catch((e) => { console.error(String(e instanceof Error ? e.message : e)); process.exit(1); }).finally(() => prisma.$disconnect());
