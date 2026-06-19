-- Kecalo — počáteční schéma znalostní báze (RAG)
-- Rozšíření pgvector pro embeddingy (1024 dimenzí, Voyage voyage-3.5)
create extension if not exists vector;

-- Dokumenty znalostní báze
create table documents (
  id            uuid primary key default gen_random_uuid(),
  filename      text not null,
  mime_type     text not null,
  status        text not null default 'uploaded'
                  check (status in ('uploaded', 'processing', 'ready', 'error')),
  error_message text,
  chunk_count   int not null default 0,
  created_at    timestamptz not null default now()
);

-- Chunky dokumentů + jejich embeddingy
create table chunks (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents (id) on delete cascade,
  chunk_index int not null,
  page        int,
  content     text not null,
  embedding   vector(1024)
);

-- Rychlé dohledání chunků daného dokumentu (mj. pro mazání a statistiky)
create index chunks_document_id_idx on chunks (document_id);

-- HNSW index pro vyhledávání kosinovou podobností nad embeddingy
create index chunks_embedding_idx on chunks using hnsw (embedding vector_cosine_ops);
