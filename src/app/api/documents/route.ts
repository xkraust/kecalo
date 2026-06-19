import { NextRequest, NextResponse, after } from "next/server";
import { supabase } from "@/lib/supabase";
import { processDocument } from "@/lib/rag/pipeline";

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
    .select("id, filename, mime_type, status, error_message, chunk_count, created_at")
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

  // Ensure storage bucket exists
  await supabase.storage
    .createBucket("documents", { public: false })
    .catch(() => {});

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
    return NextResponse.json(
      { error: insertErr?.message ?? "Chyba při ukládání" },
      { status: 500 }
    );
  }

  // Upload file to storage (use sanitized path — original name is in DB)
  const buffer = new Uint8Array(await file.arrayBuffer());
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const storagePath = `${doc.id}/file.${ext}`;
  const { error: uploadErr } = await supabase.storage
    .from("documents")
    .upload(storagePath, buffer, { contentType: file.type });

  if (uploadErr) {
    await supabase.from("documents").delete().eq("id", doc.id);
    return NextResponse.json(
      { error: `Upload selhal: ${uploadErr.message}` },
      { status: 500 }
    );
  }

  after(processDocument(doc.id));

  return NextResponse.json(
    { id: doc.id, filename: doc.filename, status: doc.status },
    { status: 201 }
  );
}
