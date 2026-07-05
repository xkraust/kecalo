import { NextRequest, NextResponse, after } from "next/server";
import { supabase } from "@/lib/supabase";
import { requireAdmin } from "@/lib/require-admin";
import { processDocument } from "@/lib/rag/pipeline";
import { withSpan, flushTelemetry } from "@/lib/telemetry";

export const maxDuration = 60;

const MAX_SIZE = 20 * 1024 * 1024; // 20 MB

// Oprava SEC-6: přípona z whitelistu je jediný spolehlivý filtr. Dřív stačilo
// deklarovat MIME application/octet-stream a kontrola přípony se obešla; navíc
// se surová přípona z názvu dostávala do cesty ve Storage. MIME se teď bere jen
// jako druhotný signál (prohlížeče u .md/.txt posílají různé nebo prázdné).
type AllowedExt = "pdf" | "txt" | "md";

function isAcceptableMime(type: string): boolean {
  if (type === "" || type === "application/octet-stream") return true;
  if (type.startsWith("text/")) return true;
  return type === "application/pdf";
}

/** Přípona z whitelistu (pdf/txt/md), nebo null. Jediný zdroj přípony pro cestu
 * ve Storage — surová hodnota z názvu se do cesty nikdy nedostane. */
function allowedExtension(file: File): AllowedExt | null {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext !== "pdf" && ext !== "txt" && ext !== "md") return null;
  if (!isAcceptableMime(file.type)) return null;
  return ext;
}

/** Deklarované PDF musí začínat magickými bajty „%PDF". */
function hasPdfMagic(buffer: Uint8Array): boolean {
  return (
    buffer[0] === 0x25 && // %
    buffer[1] === 0x50 && // P
    buffer[2] === 0x44 && // D
    buffer[3] === 0x46 // F
  );
}

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { data, error } = await supabase
    .from("documents")
    .select(
      "id, filename, mime_type, status, error_message, chunk_count, created_at, chunking_config"
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Načtení dokumentů selhalo:", error);
    return NextResponse.json(
      { error: "Načtení dokumentů se nezdařilo." },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

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

  const ext = allowedExtension(file);
  if (!ext) {
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
    console.error("Kontrola duplicitního názvu selhala:", existErr);
    return NextResponse.json(
      { error: "Ověření názvu se nezdařilo. Zkuste to prosím za chvíli." },
      { status: 500 }
    );
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
        console.error("Vložení dokumentu selhalo:", insertErr);
        return {
          ok: false,
          status: 500,
          error: "Uložení dokumentu se nezdařilo. Zkuste to prosím za chvíli.",
        };
      }

      span.setAttributes({
        "document.id": doc.id,
        "document.filename": doc.filename,
      });

      // Upload file to storage (use sanitized path — original name is in DB).
      // Přípona pochází z whitelistu (allowedExtension), ne ze surového názvu.
      const buffer = new Uint8Array(await file.arrayBuffer());

      // Deklarované PDF ověříme podle magických bajtů — přejmenovaný soubor
      // s příponou .pdf se tak nedostane do indexace (oprava SEC-6).
      if (ext === "pdf" && !hasPdfMagic(buffer)) {
        await supabase.from("documents").delete().eq("id", doc.id);
        return {
          ok: false,
          status: 400,
          error: "Soubor není platné PDF (chybí hlavička %PDF).",
        };
      }

      const storagePath = `${doc.id}/file.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("documents")
        .upload(storagePath, buffer, { contentType: file.type });

      if (uploadErr) {
        console.error("Upload souboru do Storage selhal:", uploadErr);
        await supabase.from("documents").delete().eq("id", doc.id);
        return {
          ok: false,
          status: 500,
          error: "Nahrání souboru se nezdařilo. Zkuste to prosím za chvíli.",
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
