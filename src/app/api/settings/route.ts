import { NextResponse } from "next/server";
import { getSettings, saveSettings } from "@/lib/settings";
import { requireAppRole } from "@/lib/require-role";

export async function GET() {
  const auth = await requireAppRole("viewer");
  if (!auth.ok) return auth.response;

  const settings = await getSettings();
  return NextResponse.json(settings);
}

export async function POST(request: Request) {
  const auth = await requireAppRole("admin");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Neplatný vstup" }, { status: 400 });
  }

  try {
    const saved = await saveSettings(body);
    return NextResponse.json(saved);
  } catch (err) {
    // parseSettingsInput je tolerantní (clampuje, defaultuje) a nevyhazuje —
    // sem se dostane jen DB/serverová chyba, surovou hlášku ven neposíláme (SEC-3).
    console.error("Uložení nastavení selhalo:", err);
    return NextResponse.json(
      { error: "Uložení nastavení se nezdařilo. Zkuste to prosím za chvíli." },
      { status: 500 }
    );
  }
}
