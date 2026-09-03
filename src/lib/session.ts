import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession, type SessionUser } from "@/lib/auth";

/** Current signed-in user in a server component / action, or null. */
export async function getSession(): Promise<SessionUser | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  return verifySession(token);
}
