import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { requireAppRole } from "@/lib/require-role";
import { effectiveAudiences } from "@/lib/audience-access";
import { isDocumentVisibility } from "@/lib/settings-meta";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAppRole("editor");
  if (!auth.ok) return auth.response;

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

/**
 * Změna viditelnosti a štítků dokumentu (etapa C plánu rolí).
 *
 * Dvě serverové kontroly, které se NESMÍ nahradit skrytím prvku v UI
 * (invariant 6): editor smí přiřazovat jen štítky, které sám efektivně má,
 * a na `public` smí přepnout jen admin — zveřejnění je udělení oprávnění
 * vůči anonymnímu chatu, ne správa obsahu.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAppRole("editor");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Neplatný vstup" }, { status: 400 });
  }

  const { visibility, audiences } = body as {
    visibility?: unknown;
    audiences?: unknown;
  };

  if (visibility !== undefined && !isDocumentVisibility(visibility)) {
    return NextResponse.json({ error: "Neplatná viditelnost." }, { status: 400 });
  }
  if (
    audiences !== undefined &&
    (!Array.isArray(audiences) || audiences.some((a) => typeof a !== "string"))
  ) {
    return NextResponse.json({ error: "Neplatný seznam štítků." }, { status: 400 });
  }

  const isAdmin = auth.user.appRole === "admin";
  if (visibility === "public" && !isAdmin) {
    return NextResponse.json(
      {
        error:
          "Zveřejnit dokument pro veřejný chat smí jen admin — požádejte správce.",
      },
      { status: 403 }
    );
  }

  const { data: doc, error: findErr } = await supabase
    .from("documents")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (findErr) {
    console.error("Načtení dokumentu selhalo:", findErr);
    return NextResponse.json({ error: "Operace se nezdařila." }, { status: 500 });
  }
  if (!doc) {
    return NextResponse.json({ error: "Dokument neexistuje." }, { status: 404 });
  }

  if (audiences !== undefined && !isAdmin) {
    // Editor nesmí obsah zpřístupnit oddělení, do kterého sám nepatří.
    const own = new Set(await effectiveAudiences(auth.user.id));
    const forbidden = (audiences as string[]).filter((a) => !own.has(a));
    if (forbidden.length > 0) {
      return NextResponse.json(
        {
          error: `Nemůžete přiřadit štítky, které sami nemáte: ${forbidden.join(", ")}.`,
        },
        { status: 403 }
      );
    }
  }

  if (visibility !== undefined) {
    const { error } = await supabase
      .from("documents")
      .update({ visibility })
      .eq("id", id);
    if (error) {
      console.error("Změna viditelnosti selhala:", error);
      return NextResponse.json({ error: "Uložení se nezdařilo." }, { status: 500 });
    }
  }

  if (audiences !== undefined) {
    const codes = [...new Set(audiences as string[])];
    const { error: delErr } = await supabase
      .from("document_audiences")
      .delete()
      .eq("document_id", id);
    if (delErr) {
      console.error("Úprava štítků dokumentu selhala:", delErr);
      return NextResponse.json({ error: "Uložení se nezdařilo." }, { status: 500 });
    }
    if (codes.length > 0) {
      const { error: insErr } = await supabase
        .from("document_audiences")
        .insert(codes.map((c) => ({ document_id: id, audience_code: c })));
      if (insErr) {
        console.error("Vložení štítků dokumentu selhalo:", insErr);
        return NextResponse.json(
          {
            error:
              insErr.code === "23503"
                ? "Některý ze štítků neexistuje."
                : "Uložení se nezdařilo.",
          },
          { status: insErr.code === "23503" ? 400 : 500 }
        );
      }
    }
  }

  return NextResponse.json({ ok: true });
}
