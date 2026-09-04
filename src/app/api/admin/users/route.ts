import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { hashPassword } from "@/lib/password";
import type { SessionUser } from "@/lib/auth";

export const runtime = "nodejs";

async function requireAdmin(): Promise<SessionUser | null> {
  const me = await getSession();
  return me && me.role === "admin" ? me : null;
}

const emailOk = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
const forbidden = () => NextResponse.json({ ok: false, error: "Admins only." }, { status: 403 });
const bad = (error: string) => NextResponse.json({ ok: false, error }, { status: 400 });

/** List all users (admin only). */
export async function GET() {
  const me = await requireAdmin();
  if (!me) return forbidden();
  const users = await prisma.user.findMany({
    orderBy: [{ isActive: "desc" }, { email: "asc" }],
    select: { id: true, email: true, name: true, role: true, isActive: true, lastLoginAt: true, createdAt: true },
  });
  return NextResponse.json({ ok: true, users, meId: me.id });
}

/** Create a user or update one (reset password / toggle active / change role). */
export async function POST(req: Request) {
  const me = await requireAdmin();
  if (!me) return forbidden();

  let body: { op?: string; id?: string; email?: string; name?: string; role?: string; password?: string; isActive?: boolean };
  try {
    body = await req.json();
  } catch {
    return bad("Bad request.");
  }

  switch (body.op) {
    case "create": {
      const email = (body.email ?? "").trim().toLowerCase();
      const password = body.password ?? "";
      if (!emailOk(email)) return bad("Enter a valid email address.");
      if (password.length < 8) return bad("Password must be at least 8 characters.");
      const exists = await prisma.user.findUnique({ where: { email } });
      if (exists) return bad("A user with that email already exists.");
      const user = await prisma.user.create({
        data: { email, name: body.name?.trim() || null, role: body.role === "admin" ? "admin" : "viewer", passwordHash: await hashPassword(password) },
        select: { id: true, email: true, name: true, role: true, isActive: true, lastLoginAt: true, createdAt: true },
      });
      return NextResponse.json({ ok: true, user });
    }
    case "reset": {
      if (!body.id) return bad("Missing user.");
      const password = body.password ?? "";
      if (password.length < 8) return bad("Password must be at least 8 characters.");
      await prisma.user.update({ where: { id: body.id }, data: { passwordHash: await hashPassword(password) } });
      return NextResponse.json({ ok: true });
    }
    case "toggle": {
      if (!body.id) return bad("Missing user.");
      if (body.id === me.id) return bad("You can't deactivate your own account.");
      await prisma.user.update({ where: { id: body.id }, data: { isActive: Boolean(body.isActive) } });
      return NextResponse.json({ ok: true });
    }
    case "role": {
      if (!body.id) return bad("Missing user.");
      const role = body.role === "admin" ? "admin" : "viewer";
      if (body.id === me.id && role !== "admin") return bad("You can't remove your own admin role.");
      await prisma.user.update({ where: { id: body.id }, data: { role } });
      return NextResponse.json({ ok: true });
    }
    default:
      return bad("Unknown operation.");
  }
}
