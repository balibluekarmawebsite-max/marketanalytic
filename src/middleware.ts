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
  // (127.0.0.1:3100). A relative redirect can get resolved against THAT address
  // by the proxy and bounce the browser to http://localhost:3100/login, which is
  // unreachable. So redirect to an ABSOLUTE public URL. Prefer the explicitly
  // configured APP_URL (set it in .env — most reliable); otherwise fall back to
  // the proxy's X-Forwarded-Host, then to a plain relative redirect for local dev.
  const configured = process.env.APP_URL?.replace(/\/+$/, "");
  const xfHost = req.headers.get("x-forwarded-host")?.split(",")[0].trim();
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim() || "https";
  const base = configured || (xfHost ? `${proto}://${xfHost}` : "");
  if (base) {
    return new NextResponse(null, { status: 307, headers: { Location: `${base}/login${nextParam}` } });
  }

  // Direct hit (local dev, no proxy, no APP_URL) → same-origin relative redirect.
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
