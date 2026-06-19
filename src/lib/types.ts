export type DocumentStatus = "uploaded" | "processing" | "ready" | "error";

export interface DocumentRecord {
  id: string;
  filename: string;
  mime_type: string;
  status: DocumentStatus;
  error_message: string | null;
  chunk_count: number;
  created_at: string;
}
