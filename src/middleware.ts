import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

// Gate the whole dashboard behind a session. Anything not matched below (see
// `config.matcher`) is public: the login page, the auth endpoints, the health
// check, and Next's static assets.
const PUBLIC_PATHS = ["/login", "/api/auth", "/api/health"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const user = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (user) return NextResponse.next();

  // Not signed in → send to /login, remembering where they were headed.
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  const next = pathname + (req.nextUrl.search || "");
  if (next && next !== "/") url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}

export const config = {
  // Run on everything except Next internals and common static files. The
  // path-level allow-list above handles /login, /api/auth and /api/health.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:png|jpg|jpeg|svg|ico|webp|css|js)$).*)"],
};
