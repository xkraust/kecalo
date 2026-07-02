import { NextResponse, after } from "next/server";
import { supabase } from "@/lib/supabase";
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
  const { id } = await params;

  const { data: doc, error } = await supabase
    .from("documents")
    .select("id, status")
    .eq("id", id)
    .single();

  if (error || !doc) {
    return NextResponse.json({ error: "Dokument nenalezen" }, { status: 404 });
  }

  // Tlačítko v UI běžící zpracování skryje, ale API stav kontroluje samo.
  if (doc.status === "uploaded" || doc.status === "processing") {
    return NextResponse.json(
      { error: "Dokument se právě zpracovává" },
      { status: 409 }
    );
  }

  // Okamžitá zpětná vazba pro polling tabulky — processDocument by stav nastavil
  // až po odeslání response (běží v after()).
  await supabase
    .from("documents")
    .update({ status: "processing", error_message: null })
    .eq("id", id);

  after(processDocument(id));

  return NextResponse.json({ ok: true, status: "processing" });
}
