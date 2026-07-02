import type { ChunkingConfig } from "@/lib/settings-meta";

export type DocumentStatus = "uploaded" | "processing" | "ready" | "error";

export interface DocumentRecord {
  id: string;
  filename: string;
  mime_type: string;
  status: DocumentStatus;
  error_message: string | null;
  chunk_count: number;
  created_at: string;
  /** Otisk konfigurace chunkování z poslední indexace; NULL = zastaralé (před fází 13). */
  chunking_config: ChunkingConfig | null;
}
