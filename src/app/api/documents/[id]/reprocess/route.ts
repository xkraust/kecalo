import { NextResponse, after } from "next/server";
import { supabase } from "@/lib/supabase";
import { requireAdmin } from "@/lib/require-admin";
import { processDocument } from "@/lib/rag/pipeline";

export const maxDuration = 60;

/**
 * Reindexace dokumentu bez opětovného uploadu (fáze 13): znovu spustí
 * processDocument nad originálem ve Storage — použije aktuální parametry
 * chunkování a nahradí staré chunky.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;

  // Oprava C2: kontrola stavu a přepnutí na processing v jednom podmíněném
  // updatu — dvě souběžná volání nemohou spustit dvojí zpracování (druhé
  // nezasáhne žádný řádek → 409). Zároveň dává okamžitou zpětnou vazbu pro
  // polling tabulky (processDocument běží až v after()).
  const { data: updated, error: updateErr } = await supabase
    .from("documents")
    .update({ status: "processing", error_message: null })
    .eq("id", id)
    .in("status", ["ready", "error"])
    .select("id");

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  if (!updated || updated.length === 0) {
    // Rozlišit neexistující dokument od právě zpracovávaného.
    const { data: doc } = await supabase
      .from("documents")
      .select("id")
      .eq("id", id)
      .single();
    if (!doc) {
      return NextResponse.json(
        { error: "Dokument nenalezen" },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: "Dokument se právě zpracovává" },
      { status: 409 }
    );
  }

  after(processDocument(id));

  return NextResponse.json({ ok: true, status: "processing" });
}
