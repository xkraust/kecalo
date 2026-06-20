import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import {
  createSessionCookie,
  SESSION_COOKIE_NAME,
  COOKIE_OPTIONS,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.username || !body?.password) {
    return NextResponse.json(
      { error: "Uživatelské jméno a heslo jsou povinné" },
      { status: 400 }
    );
  }

  if (
    body.username !== config.adminUsername ||
    body.password !== config.adminPassword
  ) {
    return NextResponse.json(
      { error: "Nesprávné uživatelské jméno nebo heslo" },
      { status: 401 }
    );
  }

  const cookie = await createSessionCookie(config.adminPassword);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, cookie, COOKIE_OPTIONS);
  return res;
}
