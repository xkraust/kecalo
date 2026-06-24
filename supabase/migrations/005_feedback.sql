-- Kecalo — tabulka pro zpětnou vazbu uživatelů (thumbs up/down)
-- Ukládá anonymní hodnocení odpovědí bota. Session ID z localStorage slouží k deduplikaci.

create table feedback (
  id              uuid primary key default gen_random_uuid(),
  session_id      text not null,
  message_index   int  not null check (message_index >= 0),
  rating          text not null check (rating in ('up', 'down')),
  query           text,
  created_at      timestamptz not null default now(),

  constraint feedback_unique_vote unique (session_id, message_index)
);

alter table feedback enable row level security;
