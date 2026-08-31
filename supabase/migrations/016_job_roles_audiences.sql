-- Kecalo — pracovní role, štítky publika a viditelnost dokumentů
-- (etapa C, docs/plans/roles_and_document_access_plan.md)
--
-- Tři vrstvy oprávnění: aplikační role (co smíš dělat, migrace 014), pracovní
-- role (kdo jsi v organizaci) a štítky publika (komu obsah patří). Efektivní
-- štítky uživatele = sjednocení štítků všech jeho pracovních rolí; přímá vazba
-- uživatel↔štítek ZÁMĚRNĚ neexistuje, aby oprávnění šlo měnit na jednom místě.

-- Číselník štítků publika. `label` je český název s diakritikou (jediné, co kdo
-- v adminu čte), `code` je technický slug odvozený transliterací — ASCII proto,
-- že jde o primární klíč a „č" má v Unicode dva zápisy (NFC/NFD), takže by
-- vznikly vizuálně shodné duplicity.
create table audiences (
  code       text primary key check (code ~ '^[a-z0-9_-]{2,32}$'),
  label      text not null check (char_length(label) between 2 and 120),
  created_at timestamptz not null default now()
);

-- Pracovní role sdružuje štítky. external_group je příprava na SSO (etapa D):
-- skupina z OIDC claims se mapuje na roli, tedy jedna vazba místo N štítků.
create table job_roles (
  code           text primary key check (code ~ '^[a-z0-9_-]{2,32}$'),
  label          text not null check (char_length(label) between 2 and 120),
  description    text check (char_length(description) <= 500),
  external_group text check (char_length(external_group) <= 200),
  created_at     timestamptz not null default now()
);

-- Asymetrie CASCADE vs. RESTRICT je záměrná: zaniká-li role nebo dokument,
-- ztrácí jejich vazby smysl. Štítek je ale číselníková položka přilepená na
-- CIZÍM obsahu — kaskádové mazání by jedním smazáním v číselníku tiše odebralo
-- označení ze všech dokumentů a rolí. Proto RESTRICT: smazat jde jen nepoužitý.
create table job_role_audiences (
  job_role_code text not null references job_roles(code) on delete cascade,
  audience_code text not null references audiences(code) on delete restrict,
  primary key (job_role_code, audience_code)
);

create table user_job_roles (
  user_id       uuid not null references users(id) on delete cascade,
  job_role_code text not null references job_roles(code) on delete cascade,
  primary key (user_id, job_role_code)
);

create table document_audiences (
  document_id   uuid not null references documents(id) on delete cascade,
  audience_code text not null references audiences(code) on delete restrict,
  primary key (document_id, audience_code)
);

-- Viditelnost dokumentu. DEFAULT 'public' je zvolený tak, aby nasazení migrace
-- nezneviditelnilo stávající bázi ani nerozbilo eval runner — pro NOVĚ nahraný
-- dokument hodnotu nastavuje upload routa podle app_settings (viz níže).
alter table documents
  add column if not exists visibility text not null default 'public'
  check (visibility in ('public', 'restricted'));

-- Provozní režim: veřejná pojišťovna vs. interní znalostní báze. Kdyby byl
-- upload natvrdo 'restricted', přestal by veřejný bot znát každý nový dokument,
-- dokud ho admin ručně nezveřejní. DEFAULT 'public' = dnešní chování beze změny.
alter table app_settings
  add column if not exists default_document_visibility text not null default 'public'
  check (default_document_visibility in ('public', 'restricted'));

-- Efektivní štítky uživatele. job_role_code ve výstupu je záměrný — nese původ
-- štítku, takže admin UI umí odpovědět „proč tenhle uživatel na dokument vidí",
-- což u M:N vazby není triviální otázka.
create view user_effective_audiences as
  select ujr.user_id, jra.audience_code, ujr.job_role_code
  from user_job_roles ujr
  join job_role_audiences jra on jra.job_role_code = ujr.job_role_code;

-- Indexy pro filtr v match_chunks a pro počty použití v číselníku.
create index if not exists document_audiences_audience_idx on document_audiences(audience_code);
create index if not exists job_role_audiences_audience_idx on job_role_audiences(audience_code);
create index if not exists user_job_roles_role_idx on user_job_roles(job_role_code);
create index if not exists documents_visibility_idx on documents(visibility);

alter table audiences enable row level security;
alter table job_roles enable row level security;
alter table job_role_audiences enable row level security;
alter table user_job_roles enable row level security;
alter table document_audiences enable row level security;

-- CREATE OR REPLACE neumí změnit signaturu — funkci je nutné dropnout
-- a vytvořit znovu (stejně jako v 007_chunk_sections.sql).
drop function if exists match_chunks(vector, double precision, integer);

create function match_chunks(
  query_embedding vector(1024),
  match_threshold float default 0.35,
  match_count int default 5,
  -- POZOR na rozdíl mezi NULL a prázdným polem:
  --   NULL = bez filtru viditelnosti (aplikační role admin vidí vše)
  --   '{}' = jen veřejné dokumenty (anonymní tazatel) — bezpečný default
  -- Admin bypass se NESMÍ implementovat vyjmenováním všech kódů z číselníku:
  -- rozešel by se s nově přidaným štítkem mezi requesty.
  caller_audiences text[] default '{}'
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
    and (
      caller_audiences is null
      or documents.visibility = 'public'
      or exists (
        select 1 from document_audiences da
        where da.document_id = documents.id
          and da.audience_code = any(caller_audiences)
      )
    )
    and 1 - (chunks.embedding <=> query_embedding) > match_threshold
  order by chunks.embedding <=> query_embedding
  limit match_count;
$$;
