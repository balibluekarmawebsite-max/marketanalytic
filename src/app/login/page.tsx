import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { LoginForm } from "@/components/login-form";

export const dynamic = "force-dynamic";

function safeNext(next: string | undefined): string {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return "/";
}

export default async function LoginPage({ searchParams }: { searchParams: { next?: string } }) {
  const next = safeNext(searchParams.next);
  const user = await getSession();
  if (user) redirect(next);

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="h-8 w-8 rounded-md bg-primary" />
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Blue Karma · Market Analytics</h1>
            <p className="text-xs text-muted-foreground">Internal revenue-management dashboard</p>
          </div>
        </div>
        <LoginForm next={next} />
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Access is restricted to the Blue Karma revenue team.
        </p>
      </div>
    </main>
  );
}
