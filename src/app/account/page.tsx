import Link from "next/link";
import { getSession } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChangePasswordForm } from "@/components/change-password-form";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const me = await getSession();

  return (
    <main className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container flex flex-col gap-2 py-5">
          <Link href="/" className="text-xs text-muted-foreground hover:underline">← Group dashboard</Link>
          <h1 className="text-xl font-semibold tracking-tight">Your account</h1>
        </div>
      </header>

      <div className="container max-w-lg space-y-6 py-8">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Name</span><span className="font-medium">{me?.name || "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span className="font-medium">{me?.email}</span></div>
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Role</span><Badge variant={me?.role === "admin" ? "default" : "secondary"}>{me?.role}</Badge></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Change password</CardTitle>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm />
          </CardContent>
        </Card>

        {me?.role === "admin" && (
          <Link href="/admin/users" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            Manage team logins →
          </Link>
        )}
      </div>
    </main>
  );
}
