import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { hashPassword, verifyPassword } from "@/lib/password";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const me = await getSession();
  if (!me) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  let body: { currentPassword?: string; newPassword?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }

  const currentPassword = body.currentPassword ?? "";
  const newPassword = body.newPassword ?? "";
  if (newPassword.length < 8) return NextResponse.json({ ok: false, error: "New password must be at least 8 characters." }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: me.id } });
  if (!user || !user.isActive) return NextResponse.json({ ok: false, error: "Account not found." }, { status: 401 });

  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    return NextResponse.json({ ok: false, error: "Current password is incorrect." }, { status: 400 });
  }

  await prisma.user.update({ where: { id: me.id }, data: { passwordHash: await hashPassword(newPassword) } });
  return NextResponse.json({ ok: true });
}
