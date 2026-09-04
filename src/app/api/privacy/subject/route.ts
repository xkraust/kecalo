// Práva subjektu údajů — vyhledání a výmaz (GDPR etapa C).
//
// Obojí je POST s kontaktem v TĚLE požadavku, ne GET s `?contact=`: e-mail
// nebo telefon v query stringu by skončil v provozních logách (Vercel), které
// nemáme pod kontrolou a nevztahuje se na ně retence této aplikace.
//
// Identitu žadatele ověřuje obsluha mimo aplikaci — routa jen předpokládá, že
// admin ví, komu údaje vydává.
import { NextResponse } from "next/server";
import { requireAppRole } from "@/lib/require-role";
import { normalizeContact } from "@/lib/privacy/contact";
import { findSubjectData, eraseSubject } from "@/lib/privacy/subject";

const INVALID_CONTACT = {
  error: "Zadejte platný e-mail nebo telefonní číslo.",
};

export async function POST(request: Request) {
  const auth = await requireAppRole("admin");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Neplatný vstup" }, { status: 400 });
  }

  const { action, contact } = body as {
    action?: unknown;
    contact?: unknown;
  };

  if (action !== "find" && action !== "erase") {
    return NextResponse.json(
      { error: "Neznámá akce — očekává se 'find' nebo 'erase'." },
      { status: 400 }
    );
  }

  const normalized = normalizeContact(contact);
  if (!normalized) {
    return NextResponse.json(INVALID_CONTACT, { status: 400 });
  }

  try {
    if (action === "find") {
      const data = await findSubjectData(normalized);
      return NextResponse.json({ contact: normalized, ...data });
    }

    const result = await eraseSubject(normalized, auth.user.id);
    return NextResponse.json({ contact: normalized, ...result });
  } catch (err) {
    console.error("Operace nad daty subjektu selhala:", err);
    return NextResponse.json(
      { error: "Operaci se nepodařilo dokončit." },
      { status: 500 }
    );
  }
}
