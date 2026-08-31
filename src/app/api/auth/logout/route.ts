import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { getSessionUser } from "@/lib/session-user";
import { revokeUserSessions } from "@/lib/session-revocation";

export async function POST() {
  // Server-side invalidace (SEC-4): posune hranici platnosti na now(), takže
  // stávající token je odmítnut i před vypršením — nejen smazání cookie.
  // Revokace je per-user: globální revokeAllSessions() by od zavedení tabulky
  // users odhlásila celou organizaci, ne jen odhlašovaného.
  const user = await getSessionUser();
  if (user) await revokeUserSessions(user.id);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, "", { path: "/", maxAge: 0 });
  return res;
}
