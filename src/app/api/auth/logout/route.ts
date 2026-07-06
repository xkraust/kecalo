import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { revokeAllSessions } from "@/lib/session-revocation";

export async function POST() {
  // Server-side invalidace (SEC-4): posune hranici platnosti na now(), takže
  // stávající token je odmítnut i před vypršením — nejen smazání cookie.
  await revokeAllSessions();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, "", { path: "/", maxAge: 0 });
  return res;
}
