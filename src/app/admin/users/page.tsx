import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { publicPath } from "@/lib/auth";
import { UsersManager, type AdminUser } from "@/components/users-manager";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const me = await getSession();
  if (!me) redirect(publicPath("/login?next=/admin/users"));
  if (me.role !== "admin") redirect(publicPath("/account")); // viewers can't manage users

  const rows = await prisma.user.findMany({
    orderBy: [{ isActive: "desc" }, { email: "asc" }],
    select: { id: true, email: true, name: true, role: true, isActive: true, lastLoginAt: true, createdAt: true },
  });
  const users: AdminUser[] = rows.map((u) => ({
    ...u,
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    createdAt: u.createdAt.toISOString(),
  }));

  return (
    <main className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container flex flex-col gap-2 py-5">
          <Link href="/account" className="text-xs text-muted-foreground hover:underline">← Your account</Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight">Team logins</h1>
            <span className="ml-auto text-xs text-muted-foreground">Add teammates, reset passwords, set roles</span>
          </div>
        </div>
      </header>

      <div className="container space-y-6 py-8">
        <UsersManager initialUsers={users} meId={me.id} />
      </div>
    </main>
  );
}
