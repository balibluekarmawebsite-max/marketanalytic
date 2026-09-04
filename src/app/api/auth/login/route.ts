import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { signSession, SESSION_COOKIE, sessionCookieMaxAge, isSecureRequest } from "@/lib/auth";

export const runtime = "nodejs";

function safeNext(next: unknown): string {
  // Only allow same-site relative paths, to avoid open-redirects.
  if (typeof next === "string" && next.startsWith("/") && !next.startsWith("//")) return next;
  return "/";
}

export async function POST(req: Request) {
  let body: { email?: string; password?: string; next?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const redirect = safeNext(body.next);
  const invalid = () => NextResponse.json({ ok: false, error: "Invalid email or password." }, { status: 401 });

  if (!email || !password) return invalid();

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) return invalid();

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return invalid();

  const token = await signSession({ id: user.id, email: user.email, name: user.name, role: user.role });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const res = NextResponse.json({ ok: true, redirect });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(req),
    path: "/",
    maxAge: sessionCookieMaxAge,
  });
  return res;
}
