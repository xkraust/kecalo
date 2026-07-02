-- Fáze 12: strukturní chunkování — cesta sekce u chunku + rozšíření match_chunks.

alter table chunks add column if not exists section_path text;

-- CREATE OR REPLACE neumí změnit návratový typ (returns table),
-- funkci je nutné nejdřív odstranit a vytvořit znovu.
drop function if exists match_chunks(vector, double precision, integer);

create function match_chunks(
  query_embedding vector(1024),
  match_threshold float default 0.35,
  match_count int default 5
)
returns table (
  id uuid,
  document_id uuid,
  chunk_index int,
  page int,
  section_path text,
  content text,
  filename text,
  similarity float
)
language sql stable
as $$
  select
    chunks.id,
    chunks.document_id,
    chunks.chunk_index,
    chunks.page,
    chunks.section_path,
    chunks.content,
    documents.filename,
    1 - (chunks.embedding <=> query_embedding) as similarity
  from chunks
  join documents on chunks.document_id = documents.id
  where documents.status = 'ready'
    and 1 - (chunks.embedding <=> query_embedding) > match_threshold
  order by chunks.embedding <=> query_embedding
  limit match_count;
$$;
