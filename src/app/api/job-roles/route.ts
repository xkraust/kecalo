// Číselník pracovních rolí (etapa C plánu rolí). Jen pro aplikační roli admin.
//
// Pracovní role sdružuje štítky publika: uživatel dostane roli a štítky z ní
// odvodí. Přímá vazba uživatel↔štítek záměrně neexistuje, aby se oprávnění
// měnila na jednom místě a nevznikaly individuální výjimky.
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { requireAppRole } from "@/lib/require-role";
import { isValidCode, slugify } from "@/lib/slug";

export async function GET() {
  const auth = await requireAppRole("admin");
  if (!auth.ok) return auth.response;

  const [roles, audienceLinks, userLinks] = await Promise.all([
    supabase
      .from("job_roles")
      .select("code, label, description, created_at")
      .order("label"),
    supabase.from("job_role_audiences").select("job_role_code, audience_code"),
    supabase.from("user_job_roles").select("job_role_code"),
  ]);

  if (roles.error) {
    console.error("Načtení pracovních rolí selhalo:", roles.error);
    return NextResponse.json(
      { error: "Načtení pracovních rolí se nezdařilo." },
      { status: 500 }
    );
  }

  const audiencesByRole = new Map<string, string[]>();
  for (const link of audienceLinks.data ?? []) {
    const list = audiencesByRole.get(link.job_role_code) ?? [];
    list.push(link.audience_code);
    audiencesByRole.set(link.job_role_code, list);
  }
  const memberCounts = new Map<string, number>();
  for (const link of userLinks.data ?? []) {
    memberCounts.set(
      link.job_role_code,
      (memberCounts.get(link.job_role_code) ?? 0) + 1
    );
  }

  return NextResponse.json(
    (roles.data ?? []).map((r) => ({
      ...r,
      audiences: audiencesByRole.get(r.code) ?? [],
      member_count: memberCounts.get(r.code) ?? 0,
    }))
  );
}

export async function POST(request: Request) {
  const auth = await requireAppRole("admin");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const label = (body as { label?: unknown } | null)?.label;
  const description = (body as { description?: unknown } | null)?.description;

  if (typeof label !== "string" || label.trim().length < 2) {
    return NextResponse.json(
      { error: "Název pracovní role musí mít aspoň 2 znaky." },
      { status: 400 }
    );
  }
  const name = label.trim();
  if (name.length > 120) {
    return NextResponse.json(
      { error: "Název je delší než 120 znaků." },
      { status: 400 }
    );
  }
  if (description !== undefined && typeof description !== "string") {
    return NextResponse.json({ error: "Neplatný popis." }, { status: 400 });
  }

  const code = slugify(name);
  if (!isValidCode(code)) {
    return NextResponse.json(
      { error: "Z názvu nešel odvodit platný kód. Zvolte jiný název." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("job_roles")
    .insert({
      code,
      label: name,
      description: (description as string | undefined)?.trim() || null,
    })
    .select("code, label, description, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: `Kód „${code}" už existuje — zvolte jiný název.` },
        { status: 409 }
      );
    }
    console.error("Založení pracovní role selhalo:", error);
    return NextResponse.json(
      { error: "Založení pracovní role se nezdařilo." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ...data, audiences: [], member_count: 0 }, { status: 201 });
}
