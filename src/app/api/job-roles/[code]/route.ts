// Úprava a mazání pracovní role (etapa C plánu rolí).
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { requireAppRole } from "@/lib/require-role";
import { revokeUserSessions } from "@/lib/session-revocation";

/**
 * Odhlásí nositele role. Každá operace měnící efektivní štítky uživatele musí
 * revokovat jeho session (invariant 10) — jinak by běžící session dojezdila
 * se starými oprávněními.
 */
async function revokeMembers(roleCode: string): Promise<number> {
  const { data, error } = await supabase
    .from("user_job_roles")
    .select("user_id")
    .eq("job_role_code", roleCode);
  if (error) {
    console.error("Načtení nositelů role selhalo:", error);
    return 0;
  }
  const ids = [...new Set((data ?? []).map((r) => r.user_id as string))];
  await Promise.all(ids.map((id) => revokeUserSessions(id)));
  return ids.length;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const auth = await requireAppRole("admin");
  if (!auth.ok) return auth.response;

  const { code } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Neplatný vstup" }, { status: 400 });
  }

  const { label, description, audiences } = body as {
    label?: unknown;
    description?: unknown;
    audiences?: unknown;
  };

  const { data: role, error: findErr } = await supabase
    .from("job_roles")
    .select("code")
    .eq("code", code)
    .maybeSingle();
  if (findErr) {
    console.error("Načtení pracovní role selhalo:", findErr);
    return NextResponse.json({ error: "Operace se nezdařila." }, { status: 500 });
  }
  if (!role) {
    return NextResponse.json({ error: "Pracovní role neexistuje." }, { status: 404 });
  }

  if (label !== undefined || description !== undefined) {
    const update: Record<string, unknown> = {};
    if (label !== undefined) {
      if (typeof label !== "string" || label.trim().length < 2) {
        return NextResponse.json(
          { error: "Název musí mít aspoň 2 znaky." },
          { status: 400 }
        );
      }
      update.label = label.trim();
    }
    if (description !== undefined) {
      if (description !== null && typeof description !== "string") {
        return NextResponse.json({ error: "Neplatný popis." }, { status: 400 });
      }
      update.description = (description as string | null)?.trim() || null;
    }
    const { error } = await supabase.from("job_roles").update(update).eq("code", code);
    if (error) {
      console.error("Úprava pracovní role selhala:", error);
      return NextResponse.json({ error: "Uložení se nezdařilo." }, { status: 500 });
    }
  }

  let revoked = 0;
  if (audiences !== undefined) {
    if (!Array.isArray(audiences) || audiences.some((a) => typeof a !== "string")) {
      return NextResponse.json({ error: "Neplatný seznam štítků." }, { status: 400 });
    }
    const codes = [...new Set(audiences as string[])];

    // Celou sadu přepíšeme: smazat a vložit znovu. Vazby nenesou žádná další
    // data, takže se nemá co ztratit.
    const { error: delErr } = await supabase
      .from("job_role_audiences")
      .delete()
      .eq("job_role_code", code);
    if (delErr) {
      console.error("Úprava štítků role selhala:", delErr);
      return NextResponse.json({ error: "Uložení se nezdařilo." }, { status: 500 });
    }
    if (codes.length > 0) {
      const { error: insErr } = await supabase
        .from("job_role_audiences")
        .insert(codes.map((c) => ({ job_role_code: code, audience_code: c })));
      if (insErr) {
        // 23503 = foreign_key_violation — neexistující kód štítku.
        const status = insErr.code === "23503" ? 400 : 500;
        console.error("Vložení štítků role selhalo:", insErr);
        return NextResponse.json(
          {
            error:
              status === 400
                ? "Některý ze štítků neexistuje."
                : "Uložení se nezdařilo.",
          },
          { status }
        );
      }
    }
    // Změna sady štítků mění efektivní oprávnění nositelů (invariant 10).
    revoked = await revokeMembers(code);
  }

  return NextResponse.json({ ok: true, revokedUsers: revoked });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const auth = await requireAppRole("admin");
  if (!auth.ok) return auth.response;

  const { code } = await params;

  // Smazání role odebere přístup všem nositelům (ON DELETE CASCADE na
  // user_job_roles) — proto je nejdřív odhlásíme, ať nedojezdí se starými
  // oprávněními. UI na počet dotčených upozorňuje předem.
  const revoked = await revokeMembers(code);

  const { error } = await supabase.from("job_roles").delete().eq("code", code);
  if (error) {
    console.error("Smazání pracovní role selhalo:", error);
    return NextResponse.json({ error: "Smazání se nezdařilo." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, revokedUsers: revoked });
}
