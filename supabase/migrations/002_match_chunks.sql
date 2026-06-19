create or replace function match_chunks(
  query_embedding vector(1024),
  match_threshold float default 0.35,
  match_count int default 5
)
returns table (
  id uuid,
  document_id uuid,
  chunk_index int,
  page int,
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
