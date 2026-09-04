import { SignJWT, jwtVerify } from "jose";

// Session handling for the internal dashboard. Kept dependency-light and
// edge-safe (jose only, no bcrypt/Node APIs) so it can run in middleware as
// well as in server components and route handlers. Password hashing lives
// separately in src/lib/password.ts (Node runtime only).

export const SESSION_COOKIE = "bk_session";
const SESSION_TTL_DAYS = 7;

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
};

function secretKey(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      "AUTH_SECRET is missing or too short. Set a long random value in .env (e.g. `openssl rand -base64 32`).",
    );
  }
  return new TextEncoder().encode(s);
}

/** Sign a session JWT for a user. */
export async function signSession(user: SessionUser): Promise<string> {
  return new SignJWT({ email: user.email, name: user.name, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_DAYS}d`)
    .sign(secretKey());
}

/** Verify a session JWT; returns the user or null if missing/invalid/expired. */
export async function verifySession(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (!payload.sub) return null;
    return {
      id: payload.sub,
      email: String(payload.email ?? ""),
      name: (payload.name as string | null) ?? null,
      role: String(payload.role ?? "viewer"),
    };
  } catch {
    return null;
  }
}

export const sessionCookieMaxAge = SESSION_TTL_DAYS * 24 * 60 * 60;

/**
 * Turn a relative path into an absolute public URL using APP_URL when set, so
 * redirects behind the reverse proxy point at the real host, not 127.0.0.1:3100.
 * Falls back to the relative path (fine for local dev / same-origin).
 */
export function publicPath(path: string): string {
  const base = process.env.APP_URL?.replace(/\/+$/, "");
  if (!base) return path;
  return `${base}${path.startsWith("/") ? path : "/" + path}`;
}
