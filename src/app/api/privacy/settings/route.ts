// Uložení retenčních parametrů z /admin/privacy (GDPR etapa A/B).
//
// ZÁMĚRNĚ samostatná routa vedle /api/settings: stránka „RAG parametry"
// retenční sloupce vůbec nezapisuje, takže její „Obnovit výchozí" nemůže
// vypnout retenci ani zkrátit lhůty (viz komentář u ALL_NUMERIC_FIELDS).
import { NextResponse } from "next/server";
import { requireAppRole } from "@/lib/require-role";
import { saveRetentionSettings } from "@/lib/settings";

export async function POST(request: Request) {
  const auth = await requireAppRole("admin");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Neplatný vstup" }, { status: 400 });
  }

  try {
    const saved = await saveRetentionSettings(body);
    return NextResponse.json(saved);
  } catch (err) {
    console.error("Uložení retenčních parametrů selhalo:", err);
    return NextResponse.json(
      { error: "Nastavení se nepodařilo uložit." },
      { status: 500 }
    );
  }
}
