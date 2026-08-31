// Číselník štítků dokumentů (etapa C plánu rolí). Jen pro aplikační roli admin.
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { requireAppRole } from "@/lib/require-role";
import { isValidCode, slugify } from "@/lib/slug";

interface AudienceRow {
  code: string;
  label: string;
  created_at: string;
}

export async function GET() {
  const auth = await requireAppRole("admin");
  if (!auth.ok) return auth.response;

  const [audiences, docLinks, roleLinks] = await Promise.all([
    supabase.from("audiences").select("code, label, created_at").order("label"),
    supabase.from("document_audiences").select("audience_code"),
    supabase.from("job_role_audiences").select("audience_code"),
  ]);

  if (audiences.error) {
    console.error("Načtení štítků selhalo:", audiences.error);
    return NextResponse.json(
      { error: "Načtení štítků se nezdařilo." },
      { status: 500 }
    );
  }

  // Počty použití: bez nich vypadá zablokované mazání (ON DELETE RESTRICT)
  // jako rozbitá aplikace — admin musí vidět, kde se štítek používá.
  const countBy = (rows: { audience_code: string }[] | null) => {
    const map = new Map<string, number>();
    for (const r of rows ?? []) {
      map.set(r.audience_code, (map.get(r.audience_code) ?? 0) + 1);
    }
    return map;
  };
  const docCounts = countBy(docLinks.data);
  const roleCounts = countBy(roleLinks.data);

  return NextResponse.json(
    ((audiences.data ?? []) as AudienceRow[]).map((a) => ({
      ...a,
      document_count: docCounts.get(a.code) ?? 0,
      job_role_count: roleCounts.get(a.code) ?? 0,
    }))
  );
}

export async function POST(request: Request) {
  const auth = await requireAppRole("admin");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const label = (body as { label?: unknown } | null)?.label;
  const rawCode = (body as { code?: unknown } | null)?.code;

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

  // Kód admin zadávat nemusí — odvodí se transliterací z českého názvu.
  const code =
    typeof rawCode === "string" && rawCode.trim() ? rawCode.trim() : slugify(name);

  if (!isValidCode(code)) {
    return NextResponse.json(
      {
        error:
          "Z názvu nešel odvodit platný kód (2–32 znaků a–z, 0–9, - a _). Zadejte kód ručně.",
      },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("audiences")
    .insert({ code, label: name })
    .select("code, label, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      // Kolize slugu: dva různé názvy dají stejný kód.
      return NextResponse.json(
        {
          error: `Kód „${code}" už existuje — zvolte jiný název nebo zadejte kód ručně.`,
        },
        { status: 409 }
      );
    }
    console.error("Založení štítku selhalo:", error);
    return NextResponse.json(
      { error: "Založení štítku se nezdařilo." },
      { status: 500 }
    );
  }

  return NextResponse.json(data, { status: 201 });
}
