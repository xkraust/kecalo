// Úprava a mazání štítku dokumentu (etapa C plánu rolí).
//
// `code` je primární klíč ve dvou vazebních tabulkách, takže je po založení
// NEMĚNNÝ — přejmenování by byl update PK s kaskádou. Přejmenovat štítek ale
// jde kdykoli: mění se `label`, kód pod ním zůstává.
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { requireAppRole } from "@/lib/require-role";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const auth = await requireAppRole("admin");
  if (!auth.ok) return auth.response;

  const { code } = await params;
  const body = await request.json().catch(() => null);
  const label = (body as { label?: unknown } | null)?.label;

  if (typeof label !== "string" || label.trim().length < 2) {
    return NextResponse.json(
      { error: "Název štítku musí mít aspoň 2 znaky." },
      { status: 400 }
    );
  }
  const name = label.trim();
  if (name.length > 120) {
    return NextResponse.json(
      { error: "Název štítku je delší než 120 znaků." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("audiences")
    .update({ label: name })
    .eq("code", code)
    .select("code")
    .maybeSingle();

  if (error) {
    console.error("Úprava štítku selhala:", error);
    return NextResponse.json({ error: "Uložení se nezdařilo." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Štítek neexistuje." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const auth = await requireAppRole("admin");
  if (!auth.ok) return auth.response;

  const { code } = await params;

  // Použitý štítek nejde smazat (ON DELETE RESTRICT v migraci 016). Kontrolu
  // děláme i tady, aby uživatel dostal srozumitelnou hlášku s počty místo
  // 500 z porušeného cizího klíče.
  const [docs, roles] = await Promise.all([
    supabase
      .from("document_audiences")
      .select("document_id", { count: "exact", head: true })
      .eq("audience_code", code),
    supabase
      .from("job_role_audiences")
      .select("job_role_code", { count: "exact", head: true })
      .eq("audience_code", code),
  ]);

  const docCount = docs.count ?? 0;
  const roleCount = roles.count ?? 0;
  if (docCount > 0 || roleCount > 0) {
    const parts: string[] = [];
    if (docCount > 0) parts.push(`${docCount} dokumentů`);
    if (roleCount > 0) parts.push(`${roleCount} pracovních rolí`);
    return NextResponse.json(
      {
        error: `Štítek se používá u ${parts.join(" a ")}. Nejdřív ho odeberte, pak půjde smazat.`,
      },
      { status: 409 }
    );
  }

  const { error } = await supabase.from("audiences").delete().eq("code", code);
  if (error) {
    console.error("Smazání štítku selhalo:", error);
    return NextResponse.json({ error: "Smazání se nezdařilo." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
