import { NextRequest, NextResponse, after } from "next/server";
import { supabase } from "@/lib/supabase";
import { processDocument } from "@/lib/rag/pipeline";
import { withSpan, flushTelemetry } from "@/lib/telemetry";

export const maxDuration = 60;

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/octet-stream",
]);

const MAX_SIZE = 20 * 1024 * 1024; // 20 MB

function isAllowedFile(file: File): boolean {
  if (ALLOWED_TYPES.has(file.type)) return true;
  const ext = file.name.split(".").pop()?.toLowerCase();
  return ext === "md" || ext === "txt" || ext === "pdf";
}

export async function GET() {
  const { data, error } = await supabase
    .from("documents")
    .select(
      "id, filename, mime_type, status, error_message, chunk_count, created_at, chunking_config"
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Očekáván multipart/form-data" },
      { status: 400 }
    );
  }

  const file = formData.get("file") as File | null;
  if (!file || !file.name) {
    return NextResponse.json({ error: "Soubor je povinný" }, { status: 400 });
  }

  if (!isAllowedFile(file)) {
    return NextResponse.json(
      { error: "Povolené formáty: PDF, TXT, MD" },
      { status: 400 }
    );
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "Maximální velikost souboru je 20 MB" },
      { status: 400 }
    );
  }

  // Oprava D3: duplicitní název by vedl na duplicitní chunky v retrievalu.
  const { data: existing, error: existErr } = await supabase
    .from("documents")
    .select("id")
    .eq("filename", file.name)
    .limit(1);
  if (existErr) {
    return NextResponse.json({ error: existErr.message }, { status: 500 });
  }
  if (existing && existing.length > 0) {
    return NextResponse.json(
      {
        error:
          "Dokument s tímto názvem už existuje — nejdřív ho smažte, nebo soubor přejmenujte.",
      },
      { status: 409 }
    );
  }

  // Bucket musí existovat; „already exists" není chyba. (supabase-js nevyhazuje —
  // chyby vrací v poli error, oprava D2.)
  const { error: bucketErr } = await supabase.storage.createBucket("documents", {
    public: false,
  });
  if (bucketErr && !/already exists/i.test(bucketErr.message)) {
    console.warn("Vytvoření bucketu selhalo:", bucketErr.message);
  }

  type UploadOutcome =
    | { ok: true; id: string; filename: string; status: string }
    | { ok: false; status: number; error: string };

  const uploaded = await withSpan(
    "document.upload",
    async (span): Promise<UploadOutcome> => {
      // Insert document record
      const { data: doc, error: insertErr } = await supabase
        .from("documents")
        .insert({
          filename: file.name,
          mime_type: file.type || "application/octet-stream",
          status: "uploaded",
        })
        .select()
        .single();

      if (insertErr || !doc) {
        return {
          ok: false,
          status: 500,
          error: insertErr?.message ?? "Chyba při ukládání",
        };
      }

      span.setAttributes({
        "document.id": doc.id,
        "document.filename": doc.filename,
      });

      // Upload file to storage (use sanitized path — original name is in DB)
      const buffer = new Uint8Array(await file.arrayBuffer());
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
      const storagePath = `${doc.id}/file.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("documents")
        .upload(storagePath, buffer, { contentType: file.type });

      if (uploadErr) {
        await supabase.from("documents").delete().eq("id", doc.id);
        return {
          ok: false,
          status: 500,
          error: `Upload selhal: ${uploadErr.message}`,
        };
      }

      return { ok: true, id: doc.id, filename: doc.filename, status: doc.status };
    }
  );

  // Flush proběhne po odeslání response (document.upload span + případný error span).
  after(() => flushTelemetry());

  if (!uploaded.ok) {
    return NextResponse.json(
      { error: uploaded.error },
      { status: uploaded.status }
    );
  }

  after(processDocument(uploaded.id));

  return NextResponse.json(
    { id: uploaded.id, filename: uploaded.filename, status: uploaded.status },
    { status: 201 }
  );
}
