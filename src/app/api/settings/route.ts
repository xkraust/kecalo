import { NextResponse } from "next/server";
import { getSettings, saveSettings } from "@/lib/settings";
import { requireAdmin } from "@/lib/require-admin";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const settings = await getSettings();
  return NextResponse.json(settings);
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Neplatný vstup" }, { status: 400 });
  }

  try {
    const saved = await saveSettings(body);
    return NextResponse.json(saved);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Uložení nastavení selhalo";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
