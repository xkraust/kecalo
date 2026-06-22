import { NextResponse } from "next/server";
import { saveSettings } from "@/lib/settings";

export async function POST(request: Request) {
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
