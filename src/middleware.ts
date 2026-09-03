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
  const next = pathname + (req.nextUrl.search || "");
  const nextParam = next && next !== "/" ? `?next=${encodeURIComponent(next)}` : "";

  // Behind the Apache reverse proxy the app is reached on an internal address
  // (127.0.0.1:3100). If we let the redirect resolve against that, the browser
  // gets sent to http://localhost:3100/login and fails. So when the proxy tells
  // us the real public host (X-Forwarded-Host), build an ABSOLUTE redirect to it.
  const xfHost = req.headers.get("x-forwarded-host")?.split(",")[0].trim();
  if (xfHost) {
    const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim() || "https";
    return new NextResponse(null, { status: 307, headers: { Location: `${proto}://${xfHost}/login${nextParam}` } });
  }

  // Direct hit (local dev, no proxy) → same-origin relative redirect.
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = nextParam;
  return NextResponse.redirect(url);
}

export const config = {
  // Run on everything except Next internals and common static files. The
  // path-level allow-list above handles /login, /api/auth and /api/health.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:png|jpg|jpeg|svg|ico|webp|css|js)$).*)"],
};
