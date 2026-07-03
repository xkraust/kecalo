-- Oprava C1 (docs/issues_correction_plan.md): reindexace bez ztráty dat.
-- Nové chunky se vkládají s novým batch_id, staré (batch_id != nový) se mažou
-- až po úspěšném vložení celého batche — selhání uprostřed indexace tak
-- nezničí původní data. match_chunks se nemění: dokument je během zpracování
-- ve stavu 'processing', takže ho retrieval stejně nevrací.

alter table chunks
  add column if not exists batch_id uuid not null default gen_random_uuid();
