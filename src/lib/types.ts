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

/** `new` → `in_progress` → `closed`; `updated` = rozšířeno deduplikací (viz POST /api/leads). */
export type LeadStatus = "new" | "updated" | "in_progress" | "closed";

/** `produkt` = zájem o produkt (token [[NABIDKA]]); `hodnoceni` = kontakt po palci dolů. */
export type LeadType = "produkt" | "hodnoceni";

export interface Lead {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  note: string | null;
  /** LLM shrnutí konverzace pro zpracovatele (nahrazuje surový dotaz). */
  summary: string | null;
  session_id: string | null;
  status: LeadStatus;
  type: LeadType;
  /** Jméno zpracovatele (zatím jen "admin"; příprava na CRM). */
  assignee: string | null;
  consent: boolean;
  created_at: string;
  updated_at: string;
}
