import { NextResponse, after } from "next/server";
import { supabase } from "@/lib/supabase";
import { createRateLimiter, clientIp } from "@/lib/rate-limit";
import { recordUserThumbs } from "@/lib/langfuse-score";

// Limity vstupu — routa je veřejná (bez auth), meze brání spamu a přetečení
// int4 u message_index. Rozsahy drží validaci i DB v bezpečí.
const MAX_SESSION_ID_LENGTH = 64;
const MAX_MESSAGE_INDEX = 10000;
const MAX_QUERY_LENGTH = 2000;
/** OTel trace id = 32 hex znaků; cokoli jiného od klienta ignorujeme. */
const TRACE_ID_PATTERN = /^[0-9a-f]{32}$/;

const feedbackLimiter = createRateLimiter({ limit: 10, windowMs: 60_000 });

export async function POST(request: Request) {
  if (!feedbackLimiter(clientIp(request))) {
    return NextResponse.json(
      { error: "Příliš mnoho požadavků. Zkuste to prosím za chvíli." },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Neplatný vstup" }, { status: 400 });
  }

  const { sessionId, messageIndex, rating, query, traceId } = body;

  if (
    typeof sessionId !== "string" ||
    !sessionId ||
    sessionId.length > MAX_SESSION_ID_LENGTH ||
    !Number.isInteger(messageIndex) ||
    messageIndex < 0 ||
    messageIndex > MAX_MESSAGE_INDEX ||
    (rating !== "up" && rating !== "down")
  ) {
    return NextResponse.json({ error: "Neplatný vstup" }, { status: 400 });
  }

  const { error } = await supabase.from("feedback").upsert(
    {
      session_id: sessionId,
      message_index: messageIndex,
      rating,
      query:
        typeof query === "string" ? query.slice(0, MAX_QUERY_LENGTH) : null,
    },
    { onConflict: "session_id,message_index" }
  );

  if (error) {
    // Routa je veřejná — surová DB hláška ven nesmí (oprava SEC-3). Detail do logu.
    console.error("Uložení zpětné vazby selhalo:", error);
    return NextResponse.json(
      { error: "Zpětnou vazbu se nepodařilo uložit. Zkuste to prosím za chvíli." },
      { status: 500 }
    );
  }

  // Hlas navíc připneme na trace v Langfuse jako skóre `user-thumbs`, aby šla
  // kvalita filtrovat a měřit i na produkčním provozu (dosud byla zpětná vazba
  // jen v Supabase, bez vazby na konkrétní odpověď). Supabase zůstává zdrojem
  // pravdy — Langfuse je druhý konzument, ne náhrada.
  //
  // Běží v after(): odpověď klientovi neblokuje a případný výpadek Langfuse
  // nesmí ovlivnit už uložený hlas.
  if (typeof traceId === "string" && TRACE_ID_PATTERN.test(traceId)) {
    after(() =>
      recordUserThumbs({ traceId, sessionId, messageIndex, rating })
    );
  }

  return NextResponse.json({ ok: true });
}
