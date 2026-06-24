import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Neplatný vstup" }, { status: 400 });
  }

  const { sessionId, messageIndex, rating, query } = body;

  if (
    typeof sessionId !== "string" ||
    !sessionId ||
    typeof messageIndex !== "number" ||
    messageIndex < 0 ||
    (rating !== "up" && rating !== "down")
  ) {
    return NextResponse.json({ error: "Neplatný vstup" }, { status: 400 });
  }

  const { error } = await supabase.from("feedback").upsert(
    {
      session_id: sessionId,
      message_index: messageIndex,
      rating,
      query: typeof query === "string" ? query : null,
    },
    { onConflict: "session_id,message_index" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
