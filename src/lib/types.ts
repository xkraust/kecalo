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
  /** Viditelnost vůči anonymnímu chatu (etapa C plánu rolí). */
  visibility?: "public" | "restricted";
  /** Přiřazené štítky dokumentů (z vazební tabulky document_audiences). */
  document_audiences?: { audience_code: string }[];
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

/** Uživatel administrace (etapa B plánu rolí). */
export interface AdminUser {
  id: string;
  username: string;
  display_name: string | null;
  app_role: "admin" | "editor" | "viewer";
  auth_provider: "local" | "oidc";
  is_active: boolean;
  must_change_password: boolean;
  created_at: string;
}

/** Štítek dokumentu s počty použití (etapa C plánu rolí). */
export interface AudienceWithUsage {
  code: string;
  label: string;
  created_at: string;
  document_count: number;
  job_role_count: number;
}

/** Pracovní role se svými štítky a počtem nositelů. */
export interface JobRoleWithUsage {
  code: string;
  label: string;
  description: string | null;
  created_at: string;
  audiences: string[];
  member_count: number;
}
