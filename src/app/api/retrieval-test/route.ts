import { NextResponse } from "next/server";
import { retrieve } from "@/lib/rag/retrieve";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body?.query) {
    return NextResponse.json({ error: "Dotaz je povinný" }, { status: 400 });
  }

  try {
    const results = await retrieve(body.query);
    return NextResponse.json(results);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Retrieval selhal";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
