import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { requireAdmin } from "@/lib/require-admin";
import type { LeadStatus } from "@/lib/types";

// Povolené přechody stavů. Cílem smí být jen in_progress a closed — do
// new/updated se lead dostává výhradně insertem/deduplikací, ne ručně.
// closed je terminální: uzavřený lead se znovu neotvírá, nový zájem stejného
// kontaktu založí deduplikace jako nový řádek. DELETE není — poptávky se nemažou.
const ALLOWED_SOURCE_STATUSES: Record<"in_progress" | "closed", LeadStatus[]> =
  {
    in_progress: ["new", "updated"],
    closed: ["new", "updated", "in_progress"],
  };

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;

  const body = await request.json().catch(() => null);
  const status = (body as { status?: unknown } | null)?.status;
  if (status !== "in_progress" && status !== "closed") {
    return NextResponse.json(
      { error: "Neplatný cílový stav — povolené jsou in_progress a closed." },
      { status: 400 }
    );
  }

  // Vzor oprava C2: kontrola stavu a změna jedním podmíněným updatem —
  // souběžná volání nemohou provést dvojí přechod.
  const { data: updated, error } = await supabase
    .from("leads")
    .update({
      status,
      updated_at: new Date().toISOString(),
      // Převzetí nastaví zpracovatele; uzavření ho ponechá.
      ...(status === "in_progress" ? { assignee: "admin" } : {}),
    })
    .eq("id", id)
    .in("status", ALLOWED_SOURCE_STATUSES[status])
    .select("id");

  if (error) {
    console.error(`Změna stavu poptávky ${id} selhala:`, error);
    return NextResponse.json(
      { error: "Změna stavu se nezdařila. Zkuste to prosím za chvíli." },
      { status: 500 }
    );
  }

  if (!updated || updated.length === 0) {
    // Rozlišit neexistující poptávku od nepovoleného přechodu (typicky closed).
    const { data: lead } = await supabase
      .from("leads")
      .select("id")
      .eq("id", id)
      .single();
    if (!lead) {
      return NextResponse.json(
        { error: "Poptávka nenalezena" },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: "Přechod do tohoto stavu není z aktuálního stavu povolen." },
      { status: 409 }
    );
  }

  return NextResponse.json({ ok: true });
}
