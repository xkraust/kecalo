import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { requireAdmin } from "@/lib/require-admin";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;

  const { data: doc, error: fetchErr } = await supabase
    .from("documents")
    .select("filename")
    .eq("id", id)
    .single();

  if (fetchErr || !doc) {
    return NextResponse.json({ error: "Dokument nenalezen" }, { status: 404 });
  }

  // Smazat soubor ze Storage (chyba není fatální — záznam smažeme tak jako tak,
  // ale osiřelý soubor se aspoň zaloguje; supabase-js chyby nevyhazuje, oprava D2)
  const ext = doc.filename.split(".").pop()?.toLowerCase() ?? "bin";
  const { error: removeErr } = await supabase.storage
    .from("documents")
    .remove([`${id}/file.${ext}`]);
  if (removeErr) {
    console.warn(
      `Smazání souboru ze Storage selhalo (osiřelý soubor ${id}): ${removeErr.message}`
    );
  }

  // Smazat záznam — chunky se smažou přes ON DELETE CASCADE
  const { error: deleteErr } = await supabase
    .from("documents")
    .delete()
    .eq("id", id);

  if (deleteErr) {
    console.error(`Smazání dokumentu ${id} selhalo:`, deleteErr);
    return NextResponse.json(
      { error: "Smazání dokumentu se nezdařilo. Zkuste to prosím za chvíli." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
